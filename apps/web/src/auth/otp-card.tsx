import { useEffect,useRef,useState } from 'react'
import type { OtpRequired } from '@quiz-platform/shared'
import { authOperation } from './session-coordinator'
import { ApiError } from '../lib/api-client'
import { getAccessToken } from './token-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card,CardContent,CardHeader } from '@/components/ui/card'
// In-memory hints survive remounts; they never store codes, passwords or grants.
const cooldowns=new Map<string,number>()
// `notice` lets a caller explain why no code has arrived yet -- a failed send still returns
// a usable challenge, and the flow is recovered with Resend rather than restarted.
export function OtpCard({challenge,onVerify,allowRemember=false,onCancel,notice=''}:{challenge:OtpRequired;onVerify:(code:string,remember:boolean)=>Promise<unknown>;allowRemember?:boolean;onCancel?:()=>void;notice?:string}){
  const [code,setCode]=useState(''),[remember,setRemember]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now())
  const input=useRef<HTMLInputElement>(null)
  if(!cooldowns.has(challenge.challengeId))cooldowns.set(challenge.challengeId,Date.now()+challenge.resendAfterSeconds*1000)
  useEffect(()=>{input.current?.focus();const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[challenge.challengeId])
  const seconds=Math.max(0,Math.ceil((Date.parse(challenge.expiresAt)-now)/1000)),wait=Math.max(0,Math.ceil(((cooldowns.get(challenge.challengeId)??0)-now)/1000))
  const fail=(e:unknown)=>{setError(e instanceof Error?e.message:'Verification failed');input.current?.focus();if(e instanceof ApiError&&e.retryAfterSeconds)cooldowns.set(challenge.challengeId,Date.now()+e.retryAfterSeconds*1000)}
  const resend=async()=>{setBusy(true);setError('');try{await authOperation('/auth/otp/resend',{challengeId:challenge.challengeId},{protected:!!getAccessToken()});cooldowns.set(challenge.challengeId,Date.now()+60000);setCode('')}catch(e){fail(e)}finally{setBusy(false);setNow(Date.now())}}
  return <Card><CardHeader><h2 className="text-base font-semibold">Check your email</h2><p className="text-sm text-muted-foreground">If eligible, a code will arrive at {challenge.maskedEmail}. Keep this page open while you check your mail.</p></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e=>{e.preventDefault();if(!/^[0-9]{6}$/.test(code))return;setBusy(true);setError('');try{await onVerify(code,remember);setCode('')}catch(e){fail(e)}finally{setBusy(false)}}}>
      <Label htmlFor="email-otp">Six-digit verification code</Label><Input ref={input} id="email-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,'').slice(0,6))} aria-describedby="otp-status" aria-invalid={!!error} className="text-center text-2xl tracking-[0.7em] font-mono"/>
      <p id="otp-status" role="status" className="text-sm">{seconds?`Expires in ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'This flow expired. Start again.'}</p>
      {notice&&!error&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {allowRemember&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember this device for 30 days</label>}
      <p role="alert" aria-live="assertive" className="text-sm text-destructive">{error}</p>
      <Button type="submit" disabled={busy||code.length!==6||!seconds} className="w-full">{busy?'Verifying…':'Verify code'}</Button>
      <Button type="button" variant="outline" disabled={busy||wait>0||seconds<60} onClick={()=>void resend()} className="w-full">{wait?`Resend in ${wait}s`:'Resend code'}</Button>
      {onCancel&&<Button type="button" variant="ghost" onClick={onCancel}>Start again</Button>}
    </form>
  </CardContent></Card>
}
