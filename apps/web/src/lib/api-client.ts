import { getAccessToken } from '../auth/token-store'
import { decodeClaims,refreshSession,sameContext,writesPaused } from '../auth/session-coordinator'
import { ApiError,transport } from './api-transport'
export { ApiError } from './api-transport'
const publicPaths=new Set(['/auth/context','/auth/login','/auth/register','/auth/google','/auth/google/nonce','/auth/otp/resend','/auth/otp/verify','/auth/password-reset/request','/auth/password-reset/verify','/auth/password-reset/complete','/auth/select-workspace','/auth/refresh','/auth/logout','/tenant-requests','/tenant-requests/verify','/member-invitations/inspect','/member-invitations/accept'])
async function request<T>(path:string,init:RequestInit={}):Promise<T>{
  const token=getAccessToken(),original=decodeClaims(token),protectedPath=!publicPaths.has(path)
  if(protectedPath&&init.method&&writesPaused())throw new ApiError(0,'Reconnecting. Your changes have not been sent.','OFFLINE')
  try{return await transport<T>(path,init,token)}catch(e){
    if(!(e instanceof ApiError)||e.status!==401||!protectedPath||!token)throw e
    await refreshSession()
    if(!sameContext(original,decodeClaims(getAccessToken())))throw new ApiError(409,'Your account or workspace changed. Please retry in the displayed workspace.','AUTH_CONTEXT_CHANGED')
    return transport<T>(path,init,getAccessToken())
  }
}
export const apiGet=<T>(path:string)=>request<T>(path)
export const apiPost=<T>(path:string,data:unknown={})=>request<T>(path,{method:'POST',body:JSON.stringify(data)})
export const apiPatch=<T>(path:string,data:unknown={})=>request<T>(path,{method:'PATCH',body:JSON.stringify(data)})
export const apiDelete=<T>(path:string,data:unknown={})=>request<T>(path,{method:'DELETE',body:JSON.stringify(data)})
