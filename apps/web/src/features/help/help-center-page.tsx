import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  Flag,
  ListChecks,
  Mail,
  RotateCcw,
  Save,
  Send,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface FaqEntry {
  icon: typeof Save
  question: string
  answer: string
}

const TAKING_QUIZZES: FaqEntry[] = [
  {
    icon: Save,
    question: 'Is my progress saved automatically?',
    answer:
      'Yes. Every answer you enter is saved to the server a moment after you stop typing or make a selection — you never need to save manually. If you leave and come back, your answers will still be there.',
  },
  {
    icon: Clock,
    question: 'What happens when the timer runs out?',
    answer:
      'If a quiz has a time limit, a countdown appears at the top of the attempt. When it reaches zero, your attempt is submitted automatically with whatever answers were saved at that point.',
  },
  {
    icon: ListChecks,
    question: 'How does the question navigator work?',
    answer:
      'The panel on the right lists every question in the quiz. Click any number to jump straight to that question. Use the Answered / Unanswered / Marked filters to quickly find questions you still need to handle.',
  },
  {
    icon: Flag,
    question: 'What does "marking a question for review" do?',
    answer:
      'Tap the flag icon on a question to mark it. Marked questions are highlighted in the navigator so you can find them again before you submit — useful for anything you want to double-check.',
  },
  {
    icon: Send,
    question: 'Can I change my answers after I submit?',
    answer:
      'No — once you submit an attempt, your answers are locked in for grading and can no longer be edited.',
  },
  {
    icon: RotateCcw,
    question: 'Can I retake a quiz?',
    answer:
      'Only if the quiz allows multiple attempts. The attempt count shown on the quiz page tells you how many attempts you have used and how many remain, if any.',
  },
]

export function HelpCenterPage() {
  return (
    <div className="max-w-3xl">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </Link>

      <h1 className="text-[17px] font-bold text-gray-900">Help center</h1>
      <p className="mt-1 mb-6 text-[12px] text-gray-400">
        Guides and answers for taking and submitting quizzes.
      </p>

      <div className="space-y-2">
        {TAKING_QUIZZES.map((item) => (
          <Card key={item.question}>
            <CardContent className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <item.icon className="size-4" />
              </div>
              <div className="space-y-1">
                <p className="text-[13.5px] font-semibold text-gray-900">{item.question}</p>
                <p className="text-[13px] leading-relaxed text-gray-500">{item.answer}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Still stuck?</CardTitle>
          <CardDescription>Reach out and we'll help you sort it out.</CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="mailto:support@quizplatform.test"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-700 hover:underline"
          >
            <Mail className="size-3.5" />
            support@quizplatform.test
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
