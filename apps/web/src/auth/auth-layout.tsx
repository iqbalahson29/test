import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface AuthFeature {
  icon: LucideIcon
  text: string
}

interface AuthLayoutProps {
  eyebrow: string
  title: string
  subtitle: string
  features: AuthFeature[]
  children: ReactNode
}

export function AuthLayout({ eyebrow, title, subtitle, features, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh bg-muted/40">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white p-1.5">
            <img src="/brand.png" alt="Test Platform" className="size-full object-contain" />
          </div>
          <span className="text-base font-semibold">Test Platform</span>
        </div>

        <div className="relative space-y-6">
          <p className="text-xs font-semibold tracking-widest text-primary-foreground/70 uppercase">
            {eyebrow}
          </p>
          <h2 className="max-w-md text-3xl leading-tight font-semibold">{title}</h2>
          <p className="max-w-sm text-sm text-primary-foreground/80">{subtitle}</p>
          <ul className="space-y-3 pt-2">
            {features.map((feature) => (
              <li key={feature.text} className="flex items-start gap-3 text-sm text-primary-foreground/90">
                <feature.icon className="mt-0.5 size-4 shrink-0" />
                <span>{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Test Platform
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
            <img src="/brand.png" alt="Test Platform" className="size-10 object-contain" />
            <h1 className="text-lg font-semibold">Test Platform</h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
