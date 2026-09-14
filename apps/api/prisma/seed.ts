import { PrismaClient,Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { normalizeIdentifier } from '@quiz-platform/shared';
const prisma=new PrismaClient();
async function main(){
  if(process.env.NODE_ENV==='production'||process.env.AUTH_RELEASE_STAGE&&process.env.AUTH_RELEASE_STAGE!=='local')throw new Error('Demo seeding is forbidden in hosted environments. Use auth:bootstrap on a clean target.');
  const hash=await bcrypt.hash('Password123',10);
  await prisma.$transaction(async tx=>{
    const acme=await tx.tenant.upsert({where:{slug:'acme-school'},create:{name:'Acme School',slug:'acme-school'},update:{}});
    for(const [email,name,role] of [['superadmin@quiz-platform.test','Sam Superadmin',null],['admin@acme.test','Ada Admin',Role.ADMIN],['student@acme.test','Sam Student',Role.STUDENT]] as const){
      const normalized=normalizeIdentifier(email).normalized;
      let user=await tx.user.findUnique({where:{emailNormalized:normalized}});
      if(!user){user=await tx.user.create({data:{email,emailNormalized:normalized,name,passwordHash:hash,isSuperAdmin:role===null,emailVerifiedAt:null}});await tx.authIdentity.create({data:{userId:user.id,provider:'PASSWORD',providerUserId:user.id}});}
      if(role)await tx.membership.upsert({where:{userId_tenantId:{userId:user.id,tenantId:acme.id}},create:{userId:user.id,tenantId:acme.id,role},update:{}});
    }
  });
  console.log('Local demo accounts created. Password: Password123. Email OTP is required; use the local console mail driver.');
}
void main().catch(()=>{console.error('Demo seed refused or failed. Verify local configuration and database.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
