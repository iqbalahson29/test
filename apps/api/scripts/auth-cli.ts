import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createInterface,emitKeypressEvents } from 'node:readline';
import { loadEnvFile } from 'node:process';
import { MailerService } from '../src/mailer/mailer.service';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/auth/auth.module';
import { validateAuthConfig } from '../src/auth/security/auth-config';
import { AuthClock,AuthRandom,authError,mailboxLock,plusMs,serial } from '../src/auth/security/primitives';
import { PasswordService } from '../src/auth/password.service';
import { IdentifierService } from '../src/auth/identifier.service';
import { AuthPolicyService } from '../src/auth/auth-policy.service';
import { SecurityEventsService } from '../src/auth/security/security-events.service';
import { OtpService } from '../src/auth/otp.service';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,validate:validateAuthConfig}),PrismaModule,AuthModule]})
class CliModule {}
async function ask(label:string,hidden=false):Promise<string>{
  if(!hidden){const rl=createInterface({input:process.stdin,output:process.stdout});try{return await new Promise(resolve=>rl.question(label,resolve));}finally{rl.close();}}
  process.stdout.write(label);emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const key=(_:string,k:{name?:string;ctrl?:boolean;sequence?:string})=>{
    if(k.ctrl&&k.name==='c'){finish();reject(new Error('Cancelled'));return;}
    if(k.name==='return'){finish();resolve(value);return;}
    if(k.name==='backspace'){value=[...value].slice(0,-1).join('');return;}
    if(k.sequence&&!k.ctrl)value+=k.sequence;
  };const finish=()=>{process.stdin.off('keypress',key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};process.stdin.on('keypress',key);});
}
async function main(){
  const command=process.argv[2];
  if(command==='config-check'){try{loadEnvFile()}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}validateAuthConfig(process.env);process.stdout.write('Authentication configuration valid. External provider and delivery readiness must be verified separately.\n');return;}
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('This command requires an interactive host TTY');
  if(!['bootstrap','issue-login-otp'].includes(command))throw new Error('Unknown authentication command');
  const app=await NestFactory.createApplicationContext(CliModule,{logger:false});
  try{
    const db=app.get(PrismaService),identifier=app.get(IdentifierService).normalize(await ask('Email identifier: ')),clock=app.get(AuthClock),events=app.get(SecurityEventsService);
    if(command==='bootstrap'){
      const password=await ask('Initial superadmin password (hidden): ',true),confirm=await ask('Confirm password (hidden): ',true);if(password!==confirm)throw new Error('Passwords do not match');
      const hash=await app.get(PasswordService).hash(password);if(!app.get(MailerService).allowed(identifier.normalized))throw new Error('Invalid bootstrap identifier for this release stage');
      await serial(db,async tx=>{await mailboxLock(tx,identifier.normalized);await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'superadmin-management'},0))`;
        if(await tx.user.count()||await tx.user.count({where:{isSuperAdmin:true,isSuspended:false}}))throw new Error('Bootstrap requires a clean database and never overwrites an existing account');
        const user=await tx.user.create({data:{email:identifier.raw,emailNormalized:identifier.normalized,name:'Platform administrator',passwordHash:hash,isSuperAdmin:true,emailVerifiedAt:null}});await tx.authIdentity.create({data:{userId:user.id,provider:'PASSWORD',providerUserId:user.id}});await events.record(tx,'ADMIN_BOOTSTRAPPED',user.id,null,{operator:userInfo().username});
      });process.stdout.write('Initial superadmin created, unverified. Complete password and email verification in the app.\n');return;
    }
    if(process.env.NODE_ENV!=='production'||!['hosted-test','public'].includes(process.env.AUTH_RELEASE_STAGE??''))throw new Error('Operator OTP issuance runs only on the configured production host');
    const challengeId=await ask('Existing login challenge ID: '),reason=await ask('Operator reason (10–500 characters): ');if(reason.trim().length<10||reason.length>500)throw new Error('Invalid operator reason');
    const code=app.get(AuthRandom).code();
    await serial(db,async tx=>{
      await mailboxLock(tx,identifier.normalized);const now=clock.now(),c=await tx.authChallenge.findUnique({where:{publicId:challengeId},include:{user:true}});
      if(!c||c.principalKind!=='USER'||c.purpose!=='LOGIN_VERIFY'||!c.user||c.user.emailNormalized!==identifier.normalized||c.userTokenVersion!==c.user.tokenVersion||c.user.isSuspended||!c.firstFactor||!c.firstFactorAt||c.firstFactorAt<=plusMs(now,-600000)||!/^[0-9a-f]{64}$/.test(c.contextHash)||c.expiresAt<=now||c.attempts>=5||['CONSUMED','LOCKED','EXPIRED','CANCELLED'].includes(c.state))throw new Error('Challenge is not eligible for operator-assisted login');
      app.get(AuthPolicyService).enabled(c.emailNormalized);const generation=c.currentGeneration+1;
      await tx.emailOtp.create({data:{challengeId:c.id,generation,codeHash:app.get(OtpService).digest(c,generation,code),pepperVersion:Number(process.env.OTP_PEPPER_VERSION??1),sentTo:c.emailNormalized,submission:'CONFIRMED',deliveryProvenance:'OPERATOR',dispatchId:randomUUID(),expiresAt:c.expiresAt,confirmedAt:now}});
      await tx.authChallenge.update({where:{id:c.id},data:{currentGeneration:generation,state:'READY'}});await events.record(tx,'OPERATOR_LOGIN_OTP',c.user.id,null,{operator:userInfo().username,reason,provenance:'OPERATOR'});
    });process.stdout.write(`Single-use login code: ${code}\nConvey once through the operator assistance process. The original expiry and attempt limit still apply.\n`);
  }finally{await app.close();}
}
void main().catch(e=>{process.stderr.write((e instanceof Error&&/requires|Bootstrap|password|Password|Challenge|reason|configured|Invalid authentication/.test(e.message)?e.message:'Authentication command failed')+'\n');process.exitCode=1;});
