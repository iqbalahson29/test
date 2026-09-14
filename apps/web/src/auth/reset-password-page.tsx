import { Navigate } from 'react-router-dom'
// Legacy URL never consumes a URL token; restart the browser-bound recovery flow.
export function ResetPasswordPage(){return <Navigate to="/forgot-password" replace/>}
