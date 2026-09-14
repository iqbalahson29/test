import { setPostAuthRedirect } from '../../auth/post-auth-redirect'
import { useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { AuthResult,OtpRequired } from '@quiz-platform/shared'
import { authOperation } from '../../auth/session-coordinator'
import { ApiError,rememberDeviceAllowed } from '../../lib/api-transport'
import { useAuth } from '../../auth/auth-context'
import { OtpCard } from '../../auth/otp-card'
import { ChooseWorkspaceStep } from '../../auth/choose-workspace-step'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput,PasswordStrengthMeter } from '../../auth/password-field'
interface Preview {tenantName:string;role:string;maskedEmail:string;expiresAt:string}
let invitationToken:string|null=null
function captureToken(){const raw=new URLSearchParams(window.location.hash.slice(1)).get('token');if(raw){invitationToken=/^[A-Za-z0-9_-]{43}$/.test(raw)?raw:null;window.history.replaceState(null,'',window.location.pathname)}return invitationToken}
export function AcceptInvitePage(){
  const [token]=useState(captureToken),[name,setName]=useState(''),[password,setPassword]=useState(''),[challenge,setChallenge]=useState<OtpRequired|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const auth=useAuth(),navigate=useNavigate(),signedIn=['authenticated','superadmin','no-workspace'].includes(auth.status)
  const preview=useQuery({queryKey:['invite-preview'],queryFn:()=>authOperation<Preview>('/member-invitations/inspect',{token}),enabled:!!token,retry:false,gcTime:0})
  if(auth.status==='choosing-workspace')return <div className="max-w-md mx-auto p-8"><ChooseWorkspaceStep/></div>
  return <main className="min-h-screen grid place-items-center bg-muted/30 p-4"><div className="w-full max-w-md rounded-xl border bg-background p-6 space-y-4">
    <h1 className="text-xl font-semibold">Join {preview.data?.tenantName??'your workspace'}</h1>
    {!token||preview.isError?<p role="alert">This invitation is invalid or expired. Ask your workspace administrator for a new one.</p>:challenge?<OtpCard challenge={challenge} allowRemember={rememberDeviceAllowed(challenge.challengeId)} notice={notice} onCancel={()=>{setChallenge(null);setNotice('')}} onVerify={async(code,remember)=>{const result=await authOperation<AuthResult>('/auth/otp/verify',{challengeId:challenge.challengeId,code,rememberDevice:remember},{protected:signedIn,completeSession:true});if(result.status!=='choose-workspace')navigate('/',{replace:true});invitationToken=null}}/>:preview.data?<><p className="text-sm">Invited as {preview.data.role} · {preview.data.maskedEmail}</p><form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const c=await authOperation<OtpRequired>('/member-invitations/accept',{token,...(signedIn?{}:{name,password})},{protected:signedIn});setPassword('');setNotice('');setChallenge(c)}catch(e){
        // Unlike login and step-up, this page used to reduce a 503 carrying a usable challenge
        // to its message. Resubmitting then started a new flow and hit the send cooldown
        // instead of recovering the existing one, so the envelope is kept here too.
        if(e instanceof ApiError&&e.challenge){setPassword('');setError('');setNotice(e.message);setChallenge(e.challenge)}
        else setError(e instanceof Error?e.message:'Could not accept invitation')
      }finally{setBusy(false)}}}>
      {!signedIn&&<><Label htmlFor="invite-name">Your name</Label><Input id="invite-name" value={name} onChange={e=>setName(e.target.value)} required/><Label htmlFor="invite-password">New password</Label><PasswordInput id="invite-password" value={password} onChange={setPassword} autoComplete="new-password"/><PasswordStrengthMeter password={password}/><p className="text-sm">Already have an account? <Link to="/login" onClick={()=>setPostAuthRedirect('/accept-invite')} className="underline">Sign in first</Link>, then return to this invitation. Keep this tab open.</p></>}
      <p role="alert" className="text-sm text-destructive">{error}</p><Button className="w-full" disabled={busy}>{busy?'Please wait…':'Verify and accept invitation'}</Button>
    </form></>:<p>Loading invitation…</p>}
  </div></main>
}
