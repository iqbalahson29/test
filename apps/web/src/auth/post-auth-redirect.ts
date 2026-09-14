const STORAGE_KEY = 'post-auth-redirect'
function valid(path:string|null){return !!path&&/^\/(?!\/)[^?#\\]*$/.test(path)}
export function setPostAuthRedirect(path:string){if(valid(path))try{sessionStorage.setItem(STORAGE_KEY,path)}catch{/* Optional navigation hint only. */}}
export function consumePostAuthRedirect():string|null{try{const path=sessionStorage.getItem(STORAGE_KEY);sessionStorage.removeItem(STORAGE_KEY);return valid(path)?path:null}catch{return null}}
