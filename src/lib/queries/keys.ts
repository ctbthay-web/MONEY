export const queryKeys = {
  accounts: (userId?: string) => ['accounts', userId] as const,
  categories: (userId?: string) => ['categories', userId] as const,
  transactions: (userId?: string, filters?: unknown) => ['transactions', userId, filters] as const,
  goals: (userId?: string) => ['goals', userId] as const,
  goalContributions: (goalId?: string) => ['goal-contributions', goalId] as const,
  dashboardSummary: (userId?: string) => ['dashboard-summary', userId] as const,
  reportsSummary: (userId?: string, range?: unknown) => ['reports-summary', userId, range] as const,
  adminUsers: () => ['admin-users'] as const,
  adminStats: () => ['admin-stats'] as const,
}
