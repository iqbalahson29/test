import { useState } from 'react'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import type { OtpRequired } from '@quiz-platform/shared'
import { apiDelete,apiGet,ApiError } from '../lib/api-client'
import { authOperation,clearSession,logoutSession } from './session-coordinator'
import { useStepUp } from './use-step-up'
import { OtpCard } from './otp-card'
import { GoogleButton } from './google-button'
import { PasswordInput,PasswordStrengthMeter } from './password-field'
import { isStrongPassword } from './password-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card,CardContent,CardHeader } from '@/components/ui/card'
interface SecurityProfile {email:string;emailVerified:boolean;passwordPresent:boolean;connectedAccounts:{provider:string;email:string|null}[];pendingEmailChange:{newEmail:string;expiresAt:string}|null}
interface SessionItem {id:string;current:boolean;context?:string;label:string;ip?:string;lastIp?:string;lastUsedAt:string;expiresAt?:string;absoluteExpiresAt:string;membership?:{tenantName:string}|null}
export function AccountSecurity(){
  const qc=useQueryClient(),step=useStepUp(),[current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[email,setEmail]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[change,setChange]=useState<OtpRequired|null>(null)
  const {data:profile}=useQuery({queryKey:['security-profile'],queryFn:()=>apiGet<SecurityProfile>('/auth/profile')})
  const sessions=useQuery({queryKey:['auth-sessions'],queryFn:()=>apiGet<{items:SessionItem[];nextCursor:string|null}>('/auth/sessions?limit=100')})
  const devices=useQuery({queryKey:['auth-devices'],queryFn:()=>apiGet<{items:SessionItem[];nextCursor:string|null}>('/auth/devices?limit=100')})
  const refresh=()=>{void qc.invalidateQueries({queryKey:['security-profile']});void qc.invalidateQueries({queryKey:['profile']});void qc.invalidateQueries({queryKey:['auth-sessions']});void qc.invalidateQueries({queryKey:['auth-devices']})}
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await fn();refresh()}catch(e){if(e instanceof ApiError&&e.challenge)setChange(e.challenge);setError(e instanceof Error?e.message:'Please try again')}finally{setBusy(false)}}
  if(!profile)return null
  return <section className="space-y-4">{step.view}<h2 className="text-lg font-semibold">Sign-in and security</h2><p role="alert" className="text-sm text-destructive">{error}</p><p role="status" className="text-sm text-emerald-700">{message}</p>
    <Card><CardHeader><h3 className="font-semibold">Email address</h3><p className="text-sm">{profile.email} · {profile.emailVerified?'Verified':'Verification required'}</p>{profile.pendingEmailChange&&<p className="text-sm text-muted-foreground">Pending: {profile.pendingEmailChange.newEmail}. Your current email stays active until verification.</p>}</CardHeader><CardContent>
      {change?<OtpCard challenge={change} onCancel={()=>setChange(null)} onVerify={async code=>{await authOperation('/auth/email-change/verify',{challengeId:change.challengeId,code},{protected:true,completeSession:true});setChange(null);setEmail('');setCurrent('');setMessage('Email changed. Other sessions and remembered devices were revoked.');refresh()}}/>:<form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{const grantToken=await step.request('EMAIL_CHANGE_START',{email});const r=await authOperation<OtpRequired|{status:'ok'}>('/auth/email-change/request',{email,...(profile.passwordPresent?{currentPassword:current}:{}),grantToken},{protected:true});setCurrent('');if(r.status==='otp-required')setChange(r);else setMessage('Email display updated.')})}}>
        <Label htmlFor="security-email">New email address</Label><Input id="security-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><p className="text-xs text-muted-foreground">Plus tags are ignored. Verification goes to the new address without its +tag.</p>
        {profile.passwordPresent&&<><Label htmlFor="email-password">Current password</Label><PasswordInput id="email-password" value={current} onChange={setCurrent} autoComplete="current-password"/></>}
        <Button disabled={busy}>Verify and change email</Button>
      </form>}
    </CardContent></Card>
    <Card><CardHeader><h3 className="font-semibold">{profile.passwordPresent?'Change password':'Set a password'}</h3><p className="text-sm text-muted-foreground">Verify this action by email. Your current session stays active; other sessions and remembered devices are revoked.</p></CardHeader><CardContent>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(async()=>{if(password!==confirm||!isStrongPassword(password))throw new Error('Choose a valid password and matching confirmation');const action=profile.passwordPresent?'PASSWORD_CHANGE':'PASSWORD_SET';const grantToken=await step.request(action);await authOperation(profile.passwordPresent?'/auth/password/change':'/auth/password/set',{newPassword:password,grantToken,...(profile.passwordPresent?{currentPassword:current}:{})},{protected:true,completeSession:true});setPassword('');setConfirm('');setCurrent('');setMessage('Password updated.')})}}>
        {profile.passwordPresent&&<><Label htmlFor="security-current-password">Current password</Label><PasswordInput id="security-current-password" autoComplete="current-password" value={current} onChange={setCurrent}/></>}
        <Label htmlFor="security-password">New password</Label><PasswordInput id="security-password" autoComplete="new-password" value={password} onChange={setPassword}/><PasswordStrengthMeter password={password}/><Label htmlFor="security-confirm">Confirm password</Label><PasswordInput id="security-confirm" autoComplete="new-password" value={confirm} onChange={setConfirm}/><Button disabled={busy}>Verify and save password</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><h3 className="font-semibold">Connected accounts</h3></CardHeader><CardContent className="space-y-3">
      {profile.connectedAccounts.filter(a=>a.provider==='GOOGLE').map(a=><div key={a.provider} className="flex justify-between gap-3 items-center text-sm"><span>Google · {a.email}</span><Button variant="outline" disabled={busy||!profile.passwordPresent} onClick={()=>void run(async()=>{const grantToken=await step.request('GOOGLE_UNLINK');await authOperation('/auth/google/link',{grantToken},{method:'DELETE',protected:true,completeSession:true});setMessage('Google disconnected.')})}>Disconnect</Button></div>)}
      {!profile.passwordPresent&&<p className="text-xs text-muted-foreground">Set a password before disconnecting Google.</p>}
      {!profile.connectedAccounts.some(a=>a.provider==='GOOGLE')&&<GoogleButton intent="link" onCredential={async credential=>{await run(async()=>{const link=await authOperation<{pendingLinkId:string}>('/auth/google/link/request',{credential},{protected:true});const grantToken=await step.request('GOOGLE_LINK',{pendingLinkId:link.pendingLinkId});await authOperation('/auth/google/link/complete',{pendingLinkId:link.pendingLinkId,grantToken},{protected:true});setMessage('Google connected.')})}}/>}
    </CardContent></Card>
    {(['sessions','devices'] as const).map(kind=><Card key={kind}><CardHeader><h3 className="font-semibold">{kind==='sessions'?'Active sessions':'Remembered devices'}</h3></CardHeader><CardContent className="space-y-3">{(kind==='sessions'?sessions:devices).data?.items.map(item=><div key={item.id} className="flex items-center justify-between gap-4 border-b pb-3 text-sm"><div><p>{item.label} {item.current?'(this browser)':''}</p><p className="text-muted-foreground">{item.membership?.tenantName??item.context??''} · Last used {new Date(item.lastUsedAt).toLocaleString()}</p><p className="text-xs text-muted-foreground">{item.ip??item.lastIp??''} · Ends by {new Date(item.absoluteExpiresAt).toLocaleDateString()}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={()=>void run(async()=>{await apiDelete(`/auth/${kind}/${item.id}`);if(kind==='sessions'&&item.current)clearSession(true);else refresh()})}>Revoke</Button></div>)}{(kind==='sessions'?sessions:devices).data?.items.length===0&&<p className="text-sm text-muted-foreground">None</p>}</CardContent></Card>)}
    <div className="flex gap-3"><Button variant="outline" onClick={()=>void run(()=>logoutSession(false,true))}>Sign out and forget this device</Button><Button variant="destructive" onClick={()=>void run(()=>logoutSession(true))}>Sign out everywhere</Button></div>
  </section>
}
