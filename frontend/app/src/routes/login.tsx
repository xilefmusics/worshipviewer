import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import { fetchSessionUser, SESSION_QUERY_KEY, SESSION_STALE_TIME_MS } from '@/api/session'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { buildAuthLoginRedirectParam, sanitizeAppRedirect } from '@/lib/returnTo'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    return_to: typeof search.return_to === 'string' ? search.return_to : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    const user = await context.queryClient.ensureQueryData({
      queryKey: SESSION_QUERY_KEY,
      queryFn: fetchSessionUser,
      staleTime: SESSION_STALE_TIME_MS,
    })
    if (user) {
      const to = sanitizeAppRedirect(search.return_to, '/')
      throw redirect({ to: to })
    }
  },
  component: LoginPage,
})

function LoginBrandMark({ productName }: { productName: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-center gap-4 sm:gap-5">
      <img
        src="/favicon.png"
        alt=""
        width={112}
        height={112}
        className="h-14 w-auto shrink-0 object-contain sm:h-[4.5rem]"
        decoding="async"
      />
      <img
        src="/brand/logo-text.png"
        alt={productName}
        className="h-9 w-auto max-w-[min(100%,min(90vw,28rem))] object-contain object-left sm:h-11"
        decoding="async"
      />
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-4 shrink-0', className)}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function LoginPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const destination = useMemo(() => sanitizeAppRedirect(search.return_to, '/'), [search.return_to])

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [otpStep, setOtpStep] = useState<'email' | 'code'>('email')
  const [otpError, setOtpError] = useState<string | null>(null)

  const requestOtp = useMutation({
    mutationFn: async (addr: string) => {
      const { error, response } = await api.POST('/auth/otp/request', { body: { email: addr } })
      if (response.status === 204) return
      throw new Error(problemMessageFromBody(error, t('login.errors.otpGeneric')))
    },
    onSuccess: () => {
      setOtpError(null)
      setOtpStep('code')
    },
    onError: (e: Error) => setOtpError(e.message),
  })

  const verifyOtp = useMutation({
    mutationFn: async (payload: { email: string; code: string }) => {
      const { error, response } = await api.POST('/auth/otp/verify', {
        body: { email: payload.email, code: payload.code },
      })
      if (response.ok) return
      throw new Error(problemMessageFromBody(error, t('login.errors.otpGeneric')))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
      void navigate({ to: destination })
    },
    onError: (e: Error) => setOtpError(e.message),
  })

  function startOAuth() {
    const redirectParam = buildAuthLoginRedirectParam(destination)
    const url = `/auth/login?redirect_to=${encodeURIComponent(redirectParam)}`
    globalThis.location.assign(url)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <LoginBrandMark productName={t('app.name')} />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] sm:text-[0.8125rem]">
            {t('login.headline')}
          </p>
          <h1 className="mt-3 text-balance text-pretty text-lg font-semibold leading-snug text-[var(--color-foreground)] sm:text-xl sm:leading-snug">
            {t('login.supporting')}
          </h1>
        </div>

        <Card className="w-full text-left">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">{t('login.cardTitle')}</CardTitle>
            <CardDescription>{t('login.cardDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-0">
            {otpStep === 'email' ? (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="email">
                    {t('login.otp.emailLabel')}
                  </label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.otp.emailPlaceholder')}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={requestOtp.isPending || !email}
                  onClick={() => void requestOtp.mutateAsync(email.trim())}
                >
                  {t('login.otp.sendCode')}
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="code">
                    {t('login.otp.codeLabel')}
                  </label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t('login.otp.codePlaceholder')}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={verifyOtp.isPending || code.trim().length < 4}
                    onClick={() =>
                      void verifyOtp.mutateAsync({
                        email: email.trim(),
                        code: code.trim(),
                      })
                    }
                  >
                    {t('login.otp.verify')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setOtpStep('email')}>
                    {t('login.otp.back')}
                  </Button>
                </div>
              </>
            )}

            {otpError ? (
              <p role="alert" className="text-sm text-[var(--color-danger)]">
                {otpError}
              </p>
            ) : null}

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--color-border)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[var(--color-surface)] px-2 text-[var(--color-muted-foreground)]">
                  {t('login.divider')}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={startOAuth}
            >
              <GoogleIcon />
              {t('login.oauth.google')}
            </Button>
            <p className="text-center text-xs text-[var(--color-muted-foreground)]">
              {t('login.oauth.hint')}
            </p>
          </CardContent>
        </Card>
      </div>

      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[var(--color-muted-foreground)]">
        <a className="underline underline-offset-2" href="https://worshipviewer.com/imprint">
          {t('login.legal.imprint')}
        </a>
        <a className="underline underline-offset-2" href="https://worshipviewer.com/privacy">
          {t('login.legal.privacy')}
        </a>
        <a className="underline underline-offset-2" href="https://worshipviewer.com/terms">
          {t('login.legal.terms')}
        </a>
      </footer>
    </div>
  )
}
