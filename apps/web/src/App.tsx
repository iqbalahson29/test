import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './auth/app-shell'
import { HomeRedirect } from './auth/home-redirect'
import { LoginPage } from './auth/login-page'
import { ProtectedRoute } from './auth/protected-route'
import { RequestWorkspacePage } from './auth/request-workspace-page'
import { SuperAdminRoute } from './auth/super-admin-route'
import { AdminDashboard } from './dashboards/admin-dashboard'
import { AttemptPage } from './features/attempts/attempt-page'
import { MyQuizzesPage } from './features/attempts/my-quizzes-page'
import { QuizAnalyticsPage } from './features/analytics/quiz-analytics-page'
import { StudentAnalyticsPage } from './features/analytics/student-analytics-page'
import { GradingQueuePage } from './features/grading/grading-queue-page'
import { MembersPage } from './features/memberships/members-page'
import { NewQuizPage } from './features/quizzes/new-quiz-page'
import { QuizEditPage } from './features/quizzes/quiz-edit-page'
import { QuizListPage } from './features/quizzes/quiz-list-page'
import { TenantRequestsPage } from './superadmin/tenant-requests-page'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/request-workspace" element={<RequestWorkspacePage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/superadmin"
        element={
          <SuperAdminRoute>
            <TenantRequestsPage />
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
              <GradingQueuePage />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
