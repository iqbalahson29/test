import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  History,
  LineChart,
  ListChecks,
  RefreshCw,
  UserPlus,
  Users2,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const navLinks = [
  { href: '#for-students', label: 'For students' },
  { href: '#for-teachers', label: 'For teachers' },
  { href: '#how-it-works', label: 'How it works' },
]

export function LandingPage() {
  return (
    <div className="min-h-svh bg-white">
      <LandingNav />
      <Hero />
      <AudienceSection />
      <HowItWorks />
      <ApprovalSection />
      <FeatureGrid />
      <ClosingCta />
      <LandingFooter />
    </div>
  )
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <img src="/brand.png" alt="Test Platform" className="size-8 object-contain" />
          <span className="text-sm font-semibold">Test Platform</span>
        </div>
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/register">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <div>
          <Badge variant="secondary" className="mb-5">
            Test Platform
          </Badge>
          <h1 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
            Quizzes that fit how your classroom actually works
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            Build auto-graded and open-ended quizzes, invite your class, and track every attempt,
            all in one workspace built for teachers and students.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                Create student account
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/request-workspace">Request a teacher workspace</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
        <ProductPreview />
      </div>
    </section>
  )
}

const previewQuizzes = [
  { title: 'Algebra Basics: Unit 3', meta: '18 questions · auto-graded', status: 'Published', icon: ListChecks, tone: 'bg-emerald-50 text-emerald-600' },
  { title: 'Cell Biology Quiz', meta: '12 questions · 6 pending review', status: 'Grading', icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-600' },
  { title: 'World History Midterm', meta: '24 questions · draft', status: 'Draft', icon: FileCheck, tone: 'bg-gray-100 text-gray-500' },
]

function ProductPreview() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-primary-50 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-900/5">
        <div className="flex items-center gap-1.5 border-b border-gray-100 px-4 py-3">
          <span className="size-2.5 rounded-full bg-gray-200" />
          <span className="size-2.5 rounded-full bg-gray-200" />
          <span className="size-2.5 rounded-full bg-gray-200" />
          <span className="ml-3 text-xs font-medium text-muted-foreground">
            Ms. Alvarez's Workspace
          </span>
        </div>
        <div className="space-y-2 p-4">
          {previewQuizzes.map((quiz) => (
            <div
              key={quiz.title}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', quiz.tone)}>
                  <quiz.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{quiz.title}</div>
                  <div className="text-xs text-muted-foreground">{quiz.meta}</div>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0">
                {quiz.status}
              </Badge>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-primary-50 p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BarChart3 className="size-4" />
              </span>
              <div className="text-sm font-medium text-primary-700">Class average up 12% this term</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface AudiencePoint {
  text: string
}

function AudienceCard({
  id,
  icon: Icon,
  eyebrow,
  title,
  description,
  points,
  ctaLabel,
  ctaHref,
}: {
  id: string
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  points: AudiencePoint[]
  ctaLabel: string
  ctaHref: string
}) {
  return (
    <div id={id} className="scroll-mt-20 rounded-2xl border border-gray-200 p-8">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary">
        <Icon className="size-5" />
      </div>
      <p className="mt-5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h3 className="mt-1.5 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <ul className="mt-6 space-y-3">
        {points.map((point) => (
          <li key={point.text} className="flex items-start gap-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{point.text}</span>
          </li>
        ))}
      </ul>
      <Button asChild variant="outline" className="mt-7">
        <Link to={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  )
}

function AudienceSection() {
  return (
    <section className="border-t border-gray-100 bg-muted/40 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Built for both sides of the classroom</h2>
          <p className="mt-3 text-muted-foreground">
            One workspace, two experiences. Students focus on taking and tracking quizzes,
            teachers get everything they need to build and grade them.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <AudienceCard
            id="for-students"
            icon={BookOpen}
            eyebrow="For students"
            title="Join your class and start learning"
            description="Create an account, join a workspace, and take quizzes without any setup on your end."
            points={[
              { text: 'Ask to join a workspace, or get added directly by your teacher' },
              { text: 'Get instant feedback on auto-graded questions as you submit' },
              { text: 'Track your scores and progress over time in one place' },
              { text: 'One account works across every workspace you join' },
            ]}
            ctaLabel="Create student account"
            ctaHref="/register"
          />
          <AudienceCard
            id="for-teachers"
            icon={Users2}
            eyebrow="For teachers & admins"
            title="Build, grade, and manage your class"
            description="Everything a teacher needs to run a class quiz program, backed by a full audit trail."
            points={[
              { text: 'Build quizzes with multiple-choice, short-answer, and open-ended questions' },
              { text: 'Edit questions on any quiz; scores only change through an explicit regrade' },
              { text: 'Review and grade open-ended answers in one focused queue' },
              { text: 'Invite your class and manage teacher and student roles' },
            ]}
            ctaLabel="Request a teacher workspace"
            ctaHref="/request-workspace"
          />
        </div>
      </div>
    </section>
  )
}

const steps = [
  {
    title: 'Create your account',
    description: 'Students register directly. Teachers and admins request a workspace for their organization.',
  },
  {
    title: 'Get approved',
    description: 'A platform admin reviews every workspace request before it goes live. No workspace is provisioned automatically.',
  },
  {
    title: 'Build & join',
    description: 'Teachers build quizzes and invite their class. Students join by invite or by requesting to join a workspace.',
  },
  {
    title: 'Teach, learn, track',
    description: 'Students take quizzes and see their results. Teachers grade, regrade, and watch class performance roll in.',
  },
]

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">From sign-up to your first graded quiz, in four steps.</p>
        </div>
        <div className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="relative">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className="absolute top-4.5 left-9 hidden h-px w-[calc(100%-1rem)] bg-gray-200 lg:block" />
              )}
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const approvalSteps = [
  {
    icon: Building2,
    title: 'Submit a request',
    description: "Tell us about your organization, set a password, and describe what the workspace is for.",
  },
  {
    icon: ClipboardCheck,
    title: 'A platform admin reviews it',
    description: 'Every request is checked before a workspace is granted. Nothing goes live automatically.',
  },
  {
    icon: CheckCircle2,
    title: 'Sign in and start teaching',
    description: "Once approved, sign in, invite your teachers and students, and publish your first quiz.",
  },
]

function ApprovalSection() {
  return (
    <section className="border-y border-gray-100 bg-muted/40 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <Badge variant="secondary" className="mb-4">
              Workspace approval
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-balance">
              Every workspace is reviewed before it goes live
            </h2>
            <p className="mt-4 text-muted-foreground">
              Requesting a workspace doesn't create it right away. A platform admin confirms each
              request first, so every classroom on Test Platform is one a real admin has
              approved.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/request-workspace">Request a workspace</Link>
            </Button>
          </div>
          <div className="space-y-5">
            {approvalSteps.map((step, i) => (
              <div key={step.title} className="flex gap-4 rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  <step.icon className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Step {i + 1}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const features = [
  {
    icon: Zap,
    title: 'Instant auto-grading',
    description: 'Multiple-choice and short-answer questions are scored the moment a student submits.',
  },
  {
    icon: ClipboardCheck,
    title: 'A focused grading queue',
    description: 'Review and score open-ended answers one at a time, without digging through spreadsheets.',
  },
  {
    icon: RefreshCw,
    title: 'Live editing & regrade',
    description: 'Edit questions on any quiz status. Scores only change when you explicitly regrade.',
  },
  {
    icon: History,
    title: 'A full audit trail',
    description: 'Every quiz, question, and assignment change is logged, so nothing changes silently.',
  },
  {
    icon: UserPlus,
    title: 'Role-based workspaces',
    description: 'Admins, teachers, and students each see exactly what their role needs to see.',
  },
  {
    icon: LineChart,
    title: 'Class & student analytics',
    description: 'Track attempt results and class performance at a glance, per quiz or per student.',
  },
]

function FeatureGrid() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything a classroom needs</h2>
          <p className="mt-3 text-muted-foreground">No plugins, no spreadsheets on the side. It's all in the workspace.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-gray-200 p-6">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary-50 text-primary">
                <feature.icon className="size-4.5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className="bg-primary py-20 text-primary-foreground">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-balance">Ready to bring your classroom online?</h2>
        <p className="mt-3 text-primary-foreground/80">
          Students can create an account in under a minute. Teachers and admins can request a
          workspace and start building as soon as it's approved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link to="/register">Create student account</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
          >
            <Link to="/request-workspace">Request a teacher workspace</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="border-t border-gray-100 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-2">
          <img src="/brand.png" alt="Test Platform" className="size-7 object-contain" />
          <span className="text-sm font-semibold">Test Platform</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/login" className="hover:text-foreground">
            Sign in
          </Link>
          <Link to="/register" className="hover:text-foreground">
            Create account
          </Link>
          <Link to="/request-workspace" className="hover:text-foreground">
            Request workspace
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Test Platform</p>
      </div>
    </footer>
  )
}
