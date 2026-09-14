import { createContext,useContext,useEffect,useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthResult,OtpRequired,SessionResult } from '@quiz-platform/shared'
import { ApiError } from '../lib/api-client'
import { authOperation,decodeClaims,logoutSession,refreshSession,retryConnection,subscribeSession } from './session-coordinator'
import { getAccessToken } from './token-store'
import type { Membership } from './types'
type AuthStatus='loading'|'unauthenticated'|'authenticated'|'superadmin'|'choosing-workspace'|'no-workspace'|'otp-required'|'workspace-request-pending'
interface AuthContextValue {
  status:AuthStatus;membership:Membership|null;pendingChoices:Membership[];challenge:OtpRequired|null;reconnecting:boolean;
  login:(email:string,password:string)=>Promise<AuthStatus>;googleLogin:(credential:string)=>Promise<void>;
  startChallenge:(challenge:OtpRequired)=>void;verifyOtp:(code:string,remember:boolean)=>Promise<AuthStatus>;
  selectWorkspace:(membershipId:string)=>Promise<void>;switchWorkspace:(membershipId:string)=>Promise<void>;
  enterWorkspace:(tenantId:string)=>Promise<void>;exitToSuperAdmin:()=>Promise<void>;refreshSession:()=>Promise<void>;logout:()=>Promise<void>;
}
const AuthContext=createContext<AuthContextValue|null>(null)
export function AuthProvider({children}:{children:ReactNode}){
  const queryClient=useQueryClient(),[status,setStatus]=useState<AuthStatus>('loading'),[membership,setMembership]=useState<Membership|null>(null),[pendingChoices,setPendingChoices]=useState<Membership[]>([]),[selectionToken,setSelectionToken]=useState<string|null>(null),[challenge,setChallenge]=useState<OtpRequired|null>(null),[reconnecting,setReconnecting]=useState(false)
  const resultStatus=(r:AuthResult):AuthStatus=>r.status==='ok'?'authenticated':r.status==='choose-workspace'?'choosing-workspace':r.status
  const apply=(r:SessionResult)=>{setChallenge(null);setStatus(resultStatus(r));setMembership(r.status==='ok'?r.membership:null);setPendingChoices(r.status==='choose-workspace'?r.choices:[]);setSelectionToken(r.status==='choose-workspace'?r.selectionToken:null)}
  useEffect(()=>{
    let lastContext:string|null=null
    const unsubscribe=subscribeSession(e=>{
      if(e.type==='connection'){setReconnecting(e.reconnecting);return}
      const claims=e.type==='result'&&'accessToken'in e.result?decodeClaims(e.result.accessToken):null
      const key=claims?`${claims.sub}:${claims.sessionId}:${claims.contextVersion}`:null
      if(key!==lastContext||e.type==='logout'){void queryClient.cancelQueries();queryClient.clear();lastContext=key}
      if(e.type==='result')apply(e.result)
      else{setStatus('unauthenticated');setMembership(null);setChallenge(null);setSelectionToken(null);setPendingChoices([]);if(e.expired)window.location.assign('/session-expired')}
    })
    void refreshSession().catch(e=>{if(e instanceof ApiError&&e.status===401)setStatus('unauthenticated');else if(!(e instanceof ApiError&&e.code==='AUTH_CONTEXT_CHANGED'))setReconnecting(true)})
    return unsubscribe
  },[queryClient])
  const startChallenge=(c:OtpRequired)=>{setChallenge(c);setStatus('otp-required')}
  const accept=(r:AuthResult)=>{if(r.status==='otp-required')startChallenge(r);else if(r.status==='workspace-request-pending'){setChallenge(null);setStatus(r.status)}return resultStatus(r)}
  const login=async(email:string,password:string)=>{try{return accept(await authOperation<AuthResult>('/auth/login',{identifier:email,password},{completeSession:true}))}catch(e){if(e instanceof ApiError&&e.challenge){startChallenge(e.challenge);return 'otp-required' as const}throw e}}
  const googleLogin=async(credential:string)=>{try{accept(await authOperation<AuthResult>('/auth/google',{credential},{completeSession:true}))}catch(e){if(e instanceof ApiError&&e.challenge){startChallenge(e.challenge);return}throw e}}
  const verifyOtp=async(code:string,remember:boolean)=>{if(!challenge)throw new Error('Restart verification');const r=await authOperation<AuthResult>('/auth/otp/verify',{challengeId:challenge.challengeId,code,rememberDevice:remember},{completeSession:true,protected:!!getAccessToken()});return accept(r)}
  const change=async(path:string,body:unknown)=>{await authOperation<SessionResult>(path,body,{protected:true,completeSession:true})}
  return <AuthContext.Provider value={{status,membership,pendingChoices,challenge,reconnecting,login,googleLogin,startChallenge,verifyOtp,
    selectWorkspace:async(id)=>{if(selectionToken)await authOperation('/auth/select-workspace',{selectionToken,membershipId:id},{completeSession:true})},
    switchWorkspace:(id)=>change('/auth/switch-workspace',{membershipId:id}),enterWorkspace:(id)=>change('/auth/enter-workspace',{tenantId:id}),exitToSuperAdmin:()=>change('/auth/exit-workspace',{}),refreshSession:async()=>{await refreshSession()},logout:()=>logoutSession()}}>
    {reconnecting&&<div role="status" className="fixed top-0 inset-x-0 z-[100] bg-amber-100 text-amber-950 p-3 text-center text-sm">Connection interrupted. Changes are paused. <button className="underline" onClick={()=>void retryConnection().catch(()=>{})}>Retry connection</button></div>}{children}
  </AuthContext.Provider>
}
export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error('useAuth must be used within AuthProvider');return ctx}
