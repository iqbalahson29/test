import type { RefreshResult,SessionResult } from '@quiz-platform/shared'
import { ApiError,transport } from '../lib/api-transport'
import { getAccessToken,setAccessToken } from './token-store'
export interface ClientClaims {sub:string;sessionId:string;contextVersion:number;refreshGeneration:number;exp:number;type:string;tenantId?:string}
export function decodeClaims(token:string|null):ClientClaims|null{try{if(!token)return null;return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))) as ClientClaims}catch{return null}}
export const sameContext=(a:ClientClaims|null,b:ClientClaims|null)=>!!a&&!!b&&a.sub===b.sub&&a.sessionId===b.sessionId&&a.contextVersion===b.contextVersion&&a.tenantId===b.tenantId
export type SessionEvent={type:'result';result:SessionResult}|{type:'logout';expired:boolean}|{type:'connection';reconnecting:boolean;retryAt?:number}
const listeners=new Set<(event:SessionEvent)=>void>()
const owner=crypto.randomUUID(),leaseKey='quiz-auth-lease',revisionKey='quiz-auth-revision'
let channel:BroadcastChannel|null=null
try{channel=new BroadcastChannel('quiz-auth')}catch{ /* Restricted browser; cookie race recovery remains available. */ }
let epoch=0,serialTail:Promise<unknown>=Promise.resolve(),inFlight:Promise<RefreshResult>|null=null,timer:ReturnType<typeof setTimeout>|undefined,retryAt=0,reconnecting=false
let lastResult:SessionResult|null=null
let revision=0,lastApplied=0,loggedOut=false
// A logout that could not reach the server is retried later, so it records the epoch it
// belongs to. A replacement login supersedes it rather than letting it run as the new account.
let pendingLogout:{epoch:number;run:()=>Promise<unknown>}|null=null
const stamp=()=>revision=Math.max(Date.now(),revision+1)
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
// Every applied revision is recorded here synchronously, so one tab can see that another has
// moved on. A tab that finishes a refresh broadcasts the result, but that message is not
// ordered against the session lock being handed to the next tab: without this the next tab
// sees an unchanged token and refreshes a second time. Only the revision is stored, never a
// credential.
const publishRevision=(version:number)=>{try{localStorage.setItem(revisionKey,String(version))}catch{ /* Storage denied; the broadcast is then the only signal. */ }}
const publishedRevision=()=>{try{const value=Number(localStorage.getItem(revisionKey));return Number.isSafeInteger(value)?value:0}catch{return 0}}
// Waits, briefly, for the result behind a revision another tab published after `since`, which
// is read when the refresh starts. A revision already recorded by then belongs to a page that
// may be long gone, and a message that never arrives falls through to an ordinary refresh, so
// neither stalls the session.
async function awaitPublished(since:number,deadline=500){
  const until=Date.now()+deadline
  while(publishedRevision()>Math.max(since,lastApplied)&&Date.now()<until)await sleep(20)
}
function emit(event:SessionEvent,broadcast=false,version=revision){for(const fn of listeners)fn(event);if(broadcast)try{channel?.postMessage({owner,event,version})}catch{ /* No durable credentials fallback. */ }}
function connection(value:boolean,after=0){reconnecting=value;retryAt=Date.now()+after*1000;emit({type:'connection',reconnecting:value,retryAt})}
function schedule(){clearTimeout(timer);const claims=decodeClaims(getAccessToken());if(!claims||reconnecting)return;timer=setTimeout(()=>{void refreshSession().catch(()=>{})},Math.max(1000,claims.exp*1000-Date.now()-60000-Math.random()*5000))}
function apply(result:SessionResult,broadcast:boolean,version=stamp()){
  if(version<lastApplied)return
  lastApplied=version;publishRevision(version);revision=Math.max(revision,version);loggedOut=false
  // Accepting a session ends any unfinished logout: replaying it would revoke this one.
  pendingLogout=null
  const old=decodeClaims(getAccessToken()),next='accessToken'in result?decodeClaims(result.accessToken):null
  if(old&&next&&old.sessionId===next.sessionId){if(next.contextVersion<old.contextVersion||next.contextVersion===old.contextVersion&&next.refreshGeneration<old.refreshGeneration)return}
  const changed=!sameContext(old,next)
  if(changed)epoch++
  lastResult=result;setAccessToken('accessToken'in result?result.accessToken:null);connection(false);schedule();emit({type:'result',result},broadcast,version)
}
export function clearSession(expired=false,broadcast=true,version=stamp()){if(version<lastApplied)return;lastApplied=version;publishRevision(version);revision=Math.max(revision,version);loggedOut=true;epoch++;lastResult=null;setAccessToken(null);clearTimeout(timer);connection(false);emit({type:'logout',expired},broadcast,version)}
channel?.addEventListener('message',(e:MessageEvent<{owner:string;event:SessionEvent;version:number}>)=>{
  if(e.data.owner===owner||!e.data.event||!Number.isSafeInteger(e.data.version)||e.data.version<lastApplied)return
  const event=e.data.event
  if(event.type==='logout')clearSession(event.expired,false,e.data.version)
  if(event.type==='result')apply(event.result,false,e.data.version)
})
async function lease<T>(run:()=>Promise<T>):Promise<T>{
  const start=Date.now(),revision=crypto.randomUUID();let owned=false,usable=true
  const read=()=>{try{const value=localStorage.getItem(leaseKey);return value?JSON.parse(value) as {owner:string;revision:string;acquiredAt:number;expiry:number}:null}catch{usable=false;return null}}
  while(Date.now()-start<15000){
    const current=read();if(!usable)return run()
    if(!current||current.expiry<=Date.now()||Date.now()-current.acquiredAt>=15000){
      try{localStorage.setItem(leaseKey,JSON.stringify({owner,revision,acquiredAt:Date.now(),expiry:Date.now()+5000}))}catch{return run()}
      await sleep(25+Math.random()*50);const candidate=read();if(candidate?.owner===owner&&candidate.revision===revision){owned=true;break}
    }
    await sleep(75+Math.random()*75)
  }
  if(!owned)throw new ApiError(409,'Session is busy. Please retry.','REFRESH_RACE')
  const acquiredAt=Date.now(),renew=setInterval(()=>{const l=read();if(l?.owner!==owner||l.revision!==revision||Date.now()-acquiredAt>=15000)return;try{localStorage.setItem(leaseKey,JSON.stringify({...l,expiry:Date.now()+5000}))}catch{/* Best effort. */}},2000)
  try{return await run()}finally{clearInterval(renew);const l=read();if(l?.owner===owner&&l.revision===revision)try{localStorage.removeItem(leaseKey)}catch{/* Ignore. */}}
}
export function coordinated<T>(run:()=>Promise<T>):Promise<T>{
  const job=serialTail.catch(()=>{}).then(async()=>{
    if(navigator.locks)return navigator.locks.request('quiz-auth-session',run)
    return lease(run)
  });serialTail=job.catch(()=>{});return job
}
async function ensureContext(){await transport('/auth/context',{method:'POST',body:'{}'})}
const contextChanged=()=>new ApiError(409,'Your account or workspace changed. Please retry.','AUTH_CONTEXT_CHANGED')
interface OperationIntent{epoch:number;claims:ClientClaims|null;protected:boolean}
// Captured when the user initiates the operation, before it is queued. Account replacement
// and logout both bump the epoch, which invalidates any intent captured before them.
const captureIntent=(isProtected:boolean):OperationIntent=>({epoch,claims:decodeClaims(getAccessToken()),protected:isProtected})
// Stale work must abort before anything is transmitted: reporting a conflict after the send
// cannot undo a server mutation. Every await inside an operation is followed by this check.
function assertIntent(intent:OperationIntent){if(epoch!==intent.epoch)throw contextChanged()}
// Reads the credential and validates it as one step. Checking the epoch and then separately
// re-reading the global token at transmission time is what let a replacement account's token
// be sent. A same-session refresh may hand over new credentials, but only once the context
// comparison against the captured intent has succeeded.
function intentToken(intent:OperationIntent):string|null{
  assertIntent(intent)
  if(!intent.protected)return null
  const token=getAccessToken()
  if(!sameContext(intent.claims,decodeClaims(token)))throw contextChanged()
  return token
}
export async function authOperation<T>(path:string,body:unknown={},options:{protected?:boolean;method?:string;completeSession?:boolean}={}):Promise<T>{
  const isProtected=!!options.protected
  const original=decodeClaims(getAccessToken())
  const execute=(intent:OperationIntent)=>coordinated(async()=>{
    assertIntent(intent)
    const version=stamp()
    if(isProtected&&writesPaused())throw new ApiError(0,'Reconnect before making changes.','OFFLINE')
    await ensureContext()
    assertIntent(intent)
    const token=intentToken(intent)
    const result=await transport<T>(path,{method:options.method??'POST',body:JSON.stringify(body)},token)
    assertIntent(intent)
    if(options.completeSession){const candidate=result as SessionResult;if(['ok','no-workspace','superadmin','choose-workspace'].includes(candidate.status)&&('accessToken'in candidate||'selectionToken'in candidate))apply(candidate,true,version)}
    return result
  })
  try{return await execute(captureIntent(isProtected))}catch(e){
    if(!isProtected||!(e instanceof ApiError)||e.status!==401)throw e
    await refreshSession()
    if(!sameContext(original,decodeClaims(getAccessToken())))throw contextChanged()
    // The refresh stayed in the same context, so the retry re-snapshots the rotated credential.
    return execute(captureIntent(isProtected))
  }
}
export function acceptSessionResult(result:SessionResult){apply(result,true)}
export function subscribeSession(listener:(event:SessionEvent)=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function refreshSession(force=true):Promise<RefreshResult>{
  if(pendingLogout&&pendingLogout.epoch===epoch)return retryConnection().then(()=>{throw new ApiError(401,'Please sign in again','SESSION_INVALID')})
  if(pendingLogout)pendingLogout=null
  if(loggedOut)return Promise.reject(new ApiError(401,'Please sign in again','SESSION_INVALID'))
  if(inFlight)return inFlight
  const expectedEpoch=epoch,original=getAccessToken(),version=stamp(),published=publishedRevision()
  inFlight=(async()=>{
    if(Date.now()<retryAt)throw new ApiError(429,'Please wait before retrying.','RATE_LIMITED',Math.ceil((retryAt-Date.now())/1000))
    const began=Date.now()
    for(let attempt=0;attempt<3;attempt++){
      try{return await coordinated(async()=>{
        // Another tab may have refreshed while this one queued for the lock. Its result comes
        // over the channel rather than with the lock, so wait for it instead of asking the
        // server for a second rotation the moment the lock is handed over.
        await awaitPublished(published)
        if(epoch!==expectedEpoch)throw new ApiError(409,'Your account or workspace changed.','AUTH_CONTEXT_CHANGED')
        const current=decodeClaims(getAccessToken())
        if(current&&getAccessToken()!==original&&lastResult&&'accessToken'in lastResult)return lastResult
        if(!force&&current&&current.exp*1000-Date.now()>60000&&lastResult&&'accessToken'in lastResult)return lastResult
        const result=await transport<RefreshResult>('/auth/refresh',{method:'POST',body:'{}'})
        if(epoch!==expectedEpoch)throw new ApiError(409,'Your account or workspace changed.','AUTH_CONTEXT_CHANGED')
        apply(result,true,version);return result
      })}catch(e){
        if(e instanceof ApiError&&e.code==='REFRESH_RACE'&&attempt<2&&Date.now()-began<4000){await sleep(1000);const now=decodeClaims(getAccessToken());if(now&&getAccessToken()!==original&&lastResult&&'accessToken'in lastResult)return lastResult;continue}
        if(epoch!==expectedEpoch)throw new ApiError(409,'Your account or workspace changed.','AUTH_CONTEXT_CHANGED')
        if(e instanceof ApiError&&e.status===401){clearSession(!!original);throw e}
        if(e instanceof ApiError&&[0,429,503].includes(e.status))connection(true,e.retryAfterSeconds??0)
        throw e
      }
    }
    throw new ApiError(409,'Session refresh could not finish. Retry or sign in again.','REFRESH_RACE')
  })().finally(()=>{inFlight=null})
  return inFlight
}
export async function logoutSession(all=false,forgetDevice=false){
  if(all)await refreshSession(false)
  const token=getAccessToken();clearSession()
  pendingLogout={epoch,run:()=>coordinated(()=>transport(all?'/auth/logout-all':'/auth/logout',{method:'POST',body:JSON.stringify(all?{}:{forgetDevice})},token))}
  await retryConnection()
}
export async function retryConnection(){
  if(pendingLogout){
    const outstanding=pendingLogout
    // Superseded by a newer session: drop it instead of sending the old account's logout.
    if(outstanding.epoch!==epoch){pendingLogout=null;connection(false)}
    else{try{await outstanding.run();if(pendingLogout===outstanding)pendingLogout=null;connection(false)}catch(e){connection(true);throw e}}
    return
  }
  if(!loggedOut)await refreshSession()
}
export function writesPaused(){return reconnecting||!navigator.onLine}
const resume=()=>{if(document.visibilityState==='visible'&&navigator.onLine){const claims=decodeClaims(getAccessToken());if(reconnecting||claims&&claims.exp*1000-Date.now()<60000)void retryConnection().catch(()=>{});else schedule()}}
window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume)
