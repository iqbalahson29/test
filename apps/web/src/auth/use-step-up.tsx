import { useEffect,useRef,useState } from 'react'
import type { AuthAction,GrantResult,OtpRequired } from '@quiz-platform/shared'
import { authOperation } from './session-coordinator'
import { OtpCard } from './otp-card'
import { ApiError } from '../lib/api-client'
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
export function useStepUp(){
  const [challenge,setChallenge]=useState<OtpRequired|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retryAt,setRetryAt]=useState(0),[now,setNow]=useState(Date.now())
  const pending=useRef<{resolve:(token:string)=>void;reject:(e:Error)=>void;action:AuthAction;target:Record<string,string>}|null>(null)
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(timer);pending.current?.reject(new Error('Verification cancelled'));pending.current=null}},[])
  const cancel=()=>{pending.current?.reject(new Error('Verification cancelled'));pending.current=null;setChallenge(null);setOpen(false)}
  const send=async()=>{
    const job=pending.current;if(!job)return
    setBusy(true);setError('')
    try{const c=await authOperation<OtpRequired>('/auth/step-up/request',{action:job.action,target:job.target},{protected:true});if(pending.current===job)setChallenge(c)}catch(e){if(pending.current!==job)return;if(e instanceof ApiError&&e.challenge)setChallenge(e.challenge);else{setError(e instanceof Error?e.message:'Verification unavailable');setRetryAt(Date.now()+(e instanceof ApiError?e.retryAfterSeconds??0:0)*1000)}}finally{setBusy(false)}
  }
  const request=(action:AuthAction,target:Record<string,string>={})=>{
    pending.current?.reject(new Error('Verification replaced'));setChallenge(null);setOpen(true);setRetryAt(0)
    const promise=new Promise<string>((resolve,reject)=>{pending.current={resolve,reject,action,target}})
    void send();return promise
  }
  const wait=Math.max(0,Math.ceil((retryAt-now)/1000))
  const view=<Dialog open={open} onOpenChange={value=>{if(!value)cancel()}}><DialogContent className="sm:max-w-md z-[90]"><DialogTitle>Verify account action</DialogTitle><DialogDescription>A separate email code confirms this specific change.</DialogDescription>{challenge?<OtpCard challenge={challenge} onCancel={cancel} onVerify={async code=>{const job=pending.current;const grant=await authOperation<GrantResult>('/auth/step-up/verify',{challengeId:challenge.challengeId,code},{protected:true});if(pending.current!==job)return;job?.resolve(grant.grantToken);pending.current=null;setChallenge(null);setOpen(false)}}/>:<><p role="status">{busy?'Requesting verification…':error}</p><Button disabled={busy||wait>0} onClick={()=>void send()}>{wait?`Retry in ${wait}s`:'Request code'}</Button></>}</DialogContent></Dialog>
  return {request,view}
}
