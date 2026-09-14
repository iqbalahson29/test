import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { GrantResult,OtpRequired } from '@quiz-platform/shared'
import { authOperation,clearSession } from './session-coordinator'
import { OtpCard } from './otp-card'
import { AuthLayout } from './auth-layout'
import { PasswordInput,PasswordStrengthMeter } from './password-field'
import { isStrongPassword } from './password-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card,CardContent,CardHeader } from '@/components/ui/card'
export function ForgotPasswordPage(){
  const [email,setEmail]=useState(''),[challenge,setChallenge]=useState<OtpRequired|null>(null),[grant,setGrant]=useState<GrantResult|null>(null),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  return <AuthLayout eyebrow="Account recovery" title="Get back to your workspace" subtitle="Verify your email before choosing a new password." features={[]}>
    {/* `done` is checked first: a completed reset left `challenge` populated, so this
        branch used to win and re-show the consumed-code form after the server had already
        changed the password. */}
    {!done&&challenge&&!grant?<OtpCard challenge={challenge} onCancel={()=>setChallenge(null)} onVerify={async code=>setGrant(await authOperation<GrantResult>('/auth/password-reset/verify',{challengeId:challenge.challengeId,code}))}/>:<Card><CardHeader><h2 className="font-semibold">{done?'Password updated':grant?'Choose a new password':'Reset your password'}</h2></CardHeader><CardContent>
      {done?<p className="text-sm">Your sessions and remembered devices have been signed out. <Link to="/login" className="underline">Sign in again</Link>.</p>:<form className="space-y-4" onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{if(grant){if(password!==confirm||!isStrongPassword(password))throw new Error('Choose a valid password and matching confirmation');await authOperation('/auth/password-reset/complete',{grantToken:grant.grantToken,newPassword:password});clearSession();setPassword('');setConfirm('');setGrant(null);setChallenge(null);setEmail('');setDone(true)}else setChallenge(await authOperation<OtpRequired>('/auth/password-reset/request',{identifier:email}))}catch(e){setError(e instanceof Error?e.message:'Please try again')}finally{setBusy(false)}}}>
        {grant?<><Label htmlFor="new-password">New password</Label><PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password"/><PasswordStrengthMeter password={password}/><Label htmlFor="confirm-password">Confirm password</Label><PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password"/></>:<><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/><p className="text-sm text-muted-foreground">If eligible, a verification code will arrive. This does not sign you in.</p></>}
        <p role="alert" className="text-sm text-destructive">{error}</p><Button disabled={busy} className="w-full">{busy?'Please wait…':grant?'Update password':'Send verification code'}</Button><Link className="block text-center text-sm underline" to="/login">Back to sign in</Link>
      </form>}
    </CardContent></Card>}
  </AuthLayout>
}
