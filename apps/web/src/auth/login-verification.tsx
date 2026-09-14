import { rememberDeviceAllowed } from '../lib/api-transport'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth-context'
import { OtpCard } from './otp-card'
import { consumePostAuthRedirect } from './post-auth-redirect'
export function LoginVerification(){
  const {challenge,verifyOtp}=useAuth(),navigate=useNavigate()
  if(!challenge)return null
  return <OtpCard challenge={challenge} allowRemember={rememberDeviceAllowed(challenge.challengeId)} onCancel={()=>window.location.assign('/login')} onVerify={async(code,remember)=>{const result=await verifyOtp(code,remember);if(result==='workspace-request-pending')navigate('/workspace-pending',{replace:true});else if(result!=='choosing-workspace')navigate(consumePostAuthRedirect()??'/',{replace:true})}}/>
}
