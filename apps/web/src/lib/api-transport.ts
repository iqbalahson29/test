import type { OtpRequired } from '@quiz-platform/shared'
const rememberChallenges=new Map<string,boolean>()
export const rememberDeviceAllowed=(id:string)=>rememberChallenges.get(id)===true
export class ApiError extends Error {
  readonly status:number;readonly code:string;readonly retryAfterSeconds?:number;readonly challenge?:OtpRequired
  constructor(status:number,message:string,code='',retryAfterSeconds?:number,challenge?:OtpRequired){super(message);this.status=status;this.code=code;this.retryAfterSeconds=retryAfterSeconds;this.challenge=challenge}
}
export async function transport<T>(path:string,init:RequestInit={},token?:string|null):Promise<T>{
  const headers=new Headers(init.headers)
  headers.set('X-Quiz-Client','web')
  if(init.method && !['GET','HEAD'].includes(init.method)){headers.set('Content-Type','application/json');init={...init,body:init.body??'{}'}}
  if(token)headers.set('Authorization',`Bearer ${token}`)
  let res:Response
  try{res=await fetch(`/api${path}`,{...init,headers,credentials:'include'})}catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new ApiError(0,'Connection interrupted. Reconnect and retry.','OFFLINE')}
  // Eligibility is recorded for any response carrying a challenge, not only successful ones.
  // A delivery failure still returns a usable envelope, and screens that recover from it
  // reach the OTP step through this path -- dropping the hint there lost the checkbox.
  const noteRemember=(challengeId:unknown)=>{if(typeof challengeId==='string'&&res.headers.has('X-Quiz-Remember-Device'))rememberChallenges.set(challengeId,res.headers.get('X-Quiz-Remember-Device')==='true')}
  if(!res.ok){const body=await res.json().catch(()=>({})) as {message?:string;code?:string;retryAfterSeconds?:number;challenge?:OtpRequired};noteRemember(body.challenge?.challengeId);throw new ApiError(res.status,typeof body.message==='string'?body.message:'Request failed',body.code,body.retryAfterSeconds??(Number(res.headers.get('Retry-After'))||undefined),body.challenge)}
  if(res.status===204)return undefined as T
  const body:unknown=await res.json()
  if(body&&typeof body==='object'&&'challengeId'in body)noteRemember(body.challengeId)
  return body as T
}
