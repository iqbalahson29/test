import { useEffect,useRef,useState } from 'react'
import { authOperation } from './session-coordinator'
declare global { interface Window { google?:{accounts:{id:{initialize:(options:{client_id:string;nonce:string;callback:(r:{credential:string})=>void;auto_select:boolean;cancel_on_tap_outside:boolean})=>void;renderButton:(element:HTMLElement,options:{theme:string;size:string;text:string;width:number})=>void;cancel:()=>void}}} } }
let loader:Promise<void>|undefined
function load(){if(window.google)return Promise.resolve();return loader??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>resolve();script.onerror=()=>{loader=undefined;reject(new Error('Google sign-in could not load. You can still use your password.'))};document.head.appendChild(script)})}
export function GoogleButton({onCredential,intent='login'}:{onCredential:(credential:string)=>Promise<void>;intent?:'login'|'link'}){
  const ref=useRef<HTMLDivElement>(null),callback=useRef(onCredential),[error,setError]=useState('');callback.current=onCredential
  const enabled=import.meta.env.VITE_AUTH_GOOGLE_ENABLED==='true'&&!!import.meta.env.VITE_GOOGLE_CLIENT_ID
  useEffect(()=>{
    if(!enabled)return
    let active=true
    const initialize=async()=>{try{await load();const {nonce}=await authOperation<{nonce:string}>('/auth/google/nonce',{intent},{protected:intent==='link'});if(!active||!ref.current)return;window.google!.accounts.id.initialize({client_id:import.meta.env.VITE_GOOGLE_CLIENT_ID,nonce,auto_select:false,cancel_on_tap_outside:true,callback:r=>{void callback.current(r.credential).catch(e=>{setError(e instanceof Error?e.message:'Google sign-in failed. Try again or use your password.');void initialize()})}});ref.current.replaceChildren();window.google!.accounts.id.renderButton(ref.current,{theme:'outline',size:'large',text:intent==='link'?'continue_with':'signin_with',width:300})}catch(e){if(active)setError(e instanceof Error?e.message:'Google sign-in unavailable')}}
    void initialize();const timer=setInterval(()=>void initialize(),240000);return()=>{active=false;clearInterval(timer);window.google?.accounts.id.cancel()}
  },[enabled,intent])
  if(!enabled)return null
  return <div className="space-y-2"><div ref={ref} className="flex justify-center"/><p role="status" className="text-sm text-destructive">{error}</p></div>
}
