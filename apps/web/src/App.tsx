import { Route, Routes, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnyAuthRoute } from './auth/any-auth-route'
import { AppShell } from './auth/app-shell'
import { ForgotPasswordPage } from './auth/forgot-password-page'
import { HomeRedirect } from './auth/home-redirect'
import { LoginPage } from './auth/login-page'
import { NoWorkspaceDashboard } from './auth/no-workspace-dashboard'
import { NoWorkspaceRoute } from './auth/no-workspace-route'
import { ProfilePage } from './auth/profile-page'
import { ProtectedRoute } from './auth/protected-route'
import { RegisterPage } from './auth/register-page'
import { ResetPasswordPage } from './auth/reset-password-page'
import { RequestWorkspacePage } from './auth/request-workspace-page'
import { WorkspaceRequestPendingPage } from './auth/workspace-request-pending-page'
import { SuperAdminRoute } from './auth/super-admin-route'
import { AdminDashboard } from './dashboards/admin-dashboard'
import { AttemptPage } from './features/attempts/attempt-page'
import { MyQuizzesPage } from './features/attempts/my-quizzes-page'
import { QuizAnalyticsPage } from './features/analytics/quiz-analytics-page'
import { StudentAnalyticsPage } from './features/analytics/student-analytics-page'
import { GradingQueuePage } from './features/grading/grading-queue-page'
import { HelpCenterPage } from './features/help/help-center-page'
import { MembersPage } from './features/memberships/members-page'
import { NewQuizPage } from './features/quizzes/new-quiz-page'
import { QuizEditPage } from './features/quizzes/quiz-edit-page'
import { QuizListPage } from './features/quizzes/quiz-list-page'
import { QuizPrintView } from './features/quizzes/detail/quiz-print-view'
import { quizzesApi } from './features/quizzes/api'
import { PracticeAttemptPage } from './features/practice-attempts/attempt-page'
import { MyPracticeQuizzesPage } from './features/practice-attempts/my-quizzes-page'
import { PracticeQuizAnalyticsPage } from './features/practice-analytics/quiz-analytics-page'
import { StudentPracticeAnalyticsPage } from './features/practice-analytics/student-analytics-page'
import { PracticeGradingQueuePage } from './features/practice-grading/grading-queue-page'
import { practiceQuizzesApi } from './features/practice-quizzes/api'
import { NewPracticeQuizPage } from './features/practice-quizzes/new-quiz-page'
import { PracticeQuizEditPage } from './features/practice-quizzes/quiz-edit-page'
import { PracticeQuizListPage } from './features/practice-quizzes/quiz-list-page'
import { PracticeQuizPrintView } from './features/practice-quizzes/detail/quiz-print-view'
import { AcceptInvitePage } from './features/member-invitations/accept-invite-page'
import { ErrorBoundary } from './features/state-pages/error-boundary'
import { NotFoundPage } from './features/state-pages/not-found-page'
import { OfflineGate } from './features/state-pages/offline-gate'
import { JoinWorkspacePage } from './features/workspace-directory/join-workspace-page'
import { WorkspaceDirectory } from './features/workspace-directory/workspace-directory'
import { WorkspaceSettingsPage } from './features/workspace-directory/workspace-settings-page'
import { TenantRequestsPage } from './superadmin/tenant-requests-page'
import { UsersPage } from './superadmin/users-page'
import { WorkspacesPage } from './superadmin/workspaces-page'

/** Standalone /teacher/quizzes/:id/grading route wrapper — fetches the quiz
 * just for its title (GradingQueuePage requires it for export
 * filenames/headers), sharing the same ['quiz', id] cache entry
 * QuizEditPage's tabs use. */
function GradingRoute() {
  const { id } = useParams()
  const { data: quiz } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizzesApi.get(id!),
    enabled: !!id,
  })
  return <GradingQueuePage quizTitle={quiz?.title ?? ''} />
}

/** Standalone /teacher/practice-quizzes/:id/grading route wrapper — fetches
 * the quiz just for its title (PracticeGradingQueuePage requires it for
 * export filenames/headers), sharing the same ['practice-quiz', id] cache
 * entry PracticeQuizEditPage's tabs use. */
function PracticeGradingRoute() {
  const { id } = useParams()
  const { data: quiz } = useQuery({
    queryKey: ['practice-quiz', id],
    queryFn: () => practiceQuizzesApi.get(id!),
    enabled: !!id,
  })
  return <PracticeGradingQueuePage quizTitle={quiz?.title ?? ''} />
}

function App() {
  return (
    <ErrorBoundary>
      <OfflineGate>
        <AppRoutes />
      </OfflineGate>
    </ErrorBoundary>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/request-workspace" element={<RequestWorkspacePage />} />
      <Route path="/workspace-pending" element={<WorkspaceRequestPendingPage />} />
      <Route path="/join/:slug" element={<JoinWorkspacePage />} />
      <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/profile"
        element={
          <AnyAuthRoute>
            <ProfilePage />
          </AnyAuthRoute>
        }
      />

      <Route
        path="/help"
        element={
          <AnyAuthRoute>
            <AppShell>
              <HelpCenterPage />
            </AppShell>
          </AnyAuthRoute>
        }
      />

      <Route
        path="/no-workspace"
        element={
          <NoWorkspaceRoute>
            <NoWorkspaceDashboard />
          </NoWorkspaceRoute>
        }
      />

      <Route
        path="/superadmin"
        element={
          <SuperAdminRoute>
            <AppShell>
              <TenantRequestsPage />
            </AppShell>
          </SuperAdminRoute>
        }
      />
      <Route
        path="/superadmin/workspaces"
        element={
          <SuperAdminRoute>
            <AppShell>
              <WorkspacesPage />
            </AppShell>
          </SuperAdminRoute>
        }
      />
      <Route
        path="/superadmin/users"
        element={
          <SuperAdminRoute>
            <AppShell>
              <UsersPage />
            </AppShell>
          </SuperAdminRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <AdminDashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/members"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <MembersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/workspace-settings"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <WorkspaceSettingsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <QuizListPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/new"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <NewQuizPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/:id"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <QuizEditPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/:id/grading"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <GradingRoute />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/:id/analytics"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <QuizAnalyticsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/quizzes/:id/print"
        element={
          <ProtectedRoute role="ADMIN">
            <QuizPrintView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/practice-quizzes"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <PracticeQuizListPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/practice-quizzes/new"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <NewPracticeQuizPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/practice-quizzes/:id"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <PracticeQuizEditPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/practice-quizzes/:id/grading"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <PracticeGradingRoute />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/practice-quizzes/:id/analytics"
        element={
          <ProtectedRoute role="ADMIN">
            <AppShell>
              <PracticeQuizAnalyticsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher/practice-quizzes/:id/print"
        element={
          <ProtectedRoute role="ADMIN">
            <PracticeQuizPrintView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <MyQuizzesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/attempts/:id"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <AttemptPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/analytics"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <StudentAnalyticsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/join-workspace"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <WorkspaceDirectory />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/practice-quizzes"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <MyPracticeQuizzesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/practice-attempts/:id"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <PracticeAttemptPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/practice-analytics"
        element={
          <ProtectedRoute role="STUDENT">
            <AppShell>
              <StudentPracticeAnalyticsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
