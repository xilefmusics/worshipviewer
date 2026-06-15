import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import * as Dialog from '@radix-ui/react-dialog'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import { putTeamCover } from '@/api/team-cover-upload'
import type { TeamMember, TeamRole } from '@/api/teams-sessions-fetch'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTeamDetail, useTeamInvitationsList } from '@/hooks/useTeamDetail'
import { useCoverImageSrc } from '@/hooks/useCoverImageSrc'
import { getTeamDisplayName, isPersonalTeamName } from '@/lib/team-display-name'
import { buildTeamInviteLink, resolveTeamInviteLink } from '@/lib/team-invite-link'
import { isUserTeamAdmin } from '@/lib/team-permissions'
import { teamDetailKey, teamInvitationsKey, teamsListRootKey } from '@/lib/teams-sessions-keys'
import { observeElementIntersection } from '@/lib/browser-apis'
import { cn } from '@/lib/utils'
import { useHubScrollContainerRef } from '@/context/HubScrollContainerContext'
import { useOnline } from '@/hooks/use-online'
import { useSession } from '@/hooks/useSession'

const ROLE_OPTIONS: TeamRole[] = ['admin', 'content_maintainer', 'guest']

function membersEqual(a: TeamMember[], b: TeamMember[]): boolean {
  if (a.length !== b.length) return false
  const key = (m: TeamMember) => m.user.id
  const sa = [...a].sort((x, y) => key(x).localeCompare(key(y)))
  const sb = [...b].sort((x, y) => key(x).localeCompare(key(y)))
  return sa.every((m, i) => m.user.id === sb[i].user.id && m.role === sb[i].role)
}

function roleLabel(t: (k: string) => string, role: TeamRole): string {
  switch (role) {
    case 'admin':
      return t('teams.role.admin')
    case 'content_maintainer':
      return t('teams.role.content_maintainer')
    case 'guest':
      return t('teams.role.guest')
    default:
      return role
  }
}

type TeamDetailViewProps = {
  teamId: string
  onRequestClose?: () => void
}

export function TeamDetailView({ teamId, onRequestClose }: TeamDetailViewProps) {
  const { t } = useTranslation()
  const { data: me } = useSession()
  const queryClient = useQueryClient()
  const online = useOnline()
  const reduceMotion = useReducedMotion()
  const scrollRef = useHubScrollContainerRef()
  const invSentinelRef = useRef<HTMLDivElement>(null)
  const coverFileInputRef = useRef<HTMLInputElement>(null)

  const { data: team, error, isPending, refetch, isError } = useTeamDetail(teamId)
  const [coverUploading, setCoverUploading] = useState(false)
  const [memberDraft, setMemberDraft] = useState<TeamMember[] | null>(null)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false)
  const [deleteTeamError, setDeleteTeamError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteShownLink, setInviteShownLink] = useState<string | null>(null)
  const [inviteLocalErr, setInviteLocalErr] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discard unsaved member edits when switching team
    setMemberDraft(null)
    setMembersError(null)
  }, [teamId])

  const isAdmin = useMemo(() => {
    if (!me || !team) return false
    return isUserTeamAdmin(team, me.id)
  }, [me, team])

  const isPersonalTeam = useMemo(() => (team ? isPersonalTeamName(team.name) : false), [team])

  const coverDraft = team?.cover ?? ''
  const { src: coverPreviewSrc, onImageError: onCoverPreviewError } = useCoverImageSrc(coverDraft)

  const invalidateTeamCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: teamDetailKey(teamId) })
    void queryClient.invalidateQueries({ queryKey: teamsListRootKey })
  }, [queryClient, teamId])

  async function onCoverFilePicked(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file || !team || !isAdmin) return
    setCoverUploading(true)
    try {
      const updated = await putTeamCover(teamId, file)
      queryClient.setQueryData(teamDetailKey(teamId), updated)
      void queryClient.invalidateQueries({ queryKey: teamsListRootKey, refetchType: 'none' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'unsupported_type') toast.error(t('teams.coverUnsupportedType'))
      else if (msg === 'payload_too_large') toast.error(t('teams.coverTooLarge'))
      else toast.error(t('teams.coverUploadFailed'))
    } finally {
      setCoverUploading(false)
    }
  }

  const clearCover = useMutation({
    mutationFn: async () => {
      const { data, response } = await api.PATCH('/api/v1/teams/{id}', {
        params: { path: { id: teamId } },
        body: { cover: '' },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('teams.coverRemoveFailed'))
      }
      return data
    },
    onSuccess: (updated) => {
      if (updated) {
        queryClient.setQueryData(teamDetailKey(teamId), updated)
      }
      invalidateTeamCaches()
    },
    onError: (e: Error) => {
      toast.error(e.message)
    },
  })

  const coverBusy = coverUploading || clearCover.isPending

  const {
    data: invPages,
    error: invError,
    isPending: invPending,
    isFetchingNextPage: invFetchNext,
    hasNextPage: invHasNext,
    fetchNextPage: invFetchNextPage,
  } = useTeamInvitationsList(teamId, { enabled: isAdmin })

  const invitations = useMemo(
    () => (invPages?.pages ?? []).flatMap((p) => p.items),
    [invPages?.pages],
  )

  useEffect(() => {
    const root = scrollRef.current
    const el = invSentinelRef.current
    if (!root || !el || !team) return
    return observeElementIntersection(
      el,
      (entries) => {
        if (entries[0]?.isIntersecting && invHasNext && !invFetchNext) {
          void invFetchNextPage()
        }
      },
      { root, rootMargin: '120px' },
    )
  }, [invHasNext, invFetchNext, invFetchNextPage, invitations.length, team, scrollRef])

  const createInvite = useMutation({
    mutationFn: async () => {
      const { data, response } = await api.POST('/api/v1/teams/{team_id}/invitations', {
        params: { path: { team_id: teamId } },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('teams.inviteFailed'))
      }
      const inv = data as { id?: string } | undefined
      if (!inv?.id) {
        throw new Error(t('teams.inviteFailed'))
      }
      return resolveTeamInviteLink(teamId, inv.id, data)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamInvitationsKey(teamId) })
    },
  })

  const copyInviteLink = useCallback(
    async (link: string) => {
      try {
        await navigator.clipboard.writeText(link)
        toast.success(t('teams.inviteCopied'))
      } catch {
        toast.error(t('teams.inviteCopyFailed'))
      }
    },
    [t],
  )

  const deleteInvite = useMutation({
    mutationFn: async (invitationId: string) => {
      const { response } = await api.DELETE('/api/v1/teams/{team_id}/invitations/{invitation_id}', {
        params: { path: { team_id: teamId, invitation_id: invitationId } },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('teams.deleteInviteFailed'))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamInvitationsKey(teamId) })
    },
  })

  const effectiveMembers = memberDraft ?? team?.members ?? []
  const membersDirty = useMemo(() => {
    if (!team || memberDraft === null) return false
    return !membersEqual(memberDraft, team.members)
  }, [team, memberDraft])

  const patchMembers = useMutation({
    mutationFn: async (next: TeamMember[]) => {
      // Personal-team owner is admin but omitted from `members`; only non-owners are listed.
      if (!isPersonalTeam && !next.some((m) => m.role === 'admin')) {
        throw new Error(t('teams.needOneAdmin'))
      }
      const { response } = await api.PATCH('/api/v1/teams/{id}', {
        params: { path: { id: teamId } },
        body: {
          members: next.map((m) => ({ user: { id: m.user.id }, role: m.role })),
        },
      })
      if (!response.ok) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('teams.saveMembersFailed'))
      }
    },
    onSuccess: () => {
      setMemberDraft(null)
      setMembersError(null)
      void queryClient.invalidateQueries({ queryKey: teamDetailKey(teamId) })
      void queryClient.invalidateQueries({ queryKey: teamsListRootKey })
    },
    onError: (e: Error) => {
      setMembersError(e.message)
    },
  })

  const deleteTeam = useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE('/api/v1/teams/{id}', {
        params: { path: { id: teamId } },
      })
      if (!response.ok && response.status !== 204) {
        const problem = await parseProblemResponse(response.clone())
        throw new Error(problem?.title ?? t('teams.deleteFailed'))
      }
    },
    onSuccess: () => {
      setDeleteTeamError(null)
      void queryClient.invalidateQueries({ queryKey: teamsListRootKey })
      onRequestClose?.()
    },
    onError: (e: Error) => {
      setDeleteTeamError(e.message)
    },
  })

  function setMemberRole(userId: string, role: TeamRole) {
    if (!team) return
    setMembersError(null)
    setMemberDraft((d) => {
      const base = d ?? team.members
      return base.map((m) => (m.user.id === userId ? { ...m, role } : m))
    })
  }

  if (isPending) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-3 py-2">
        <div className="h-6 w-40 animate-pulse rounded bg-[var(--color-muted)]" />
        <div className="h-10 w-full animate-pulse rounded bg-[var(--color-muted)]" />
      </div>
    )
  }

  if (isError || !team) {
    return (
      <motion.div
        className="flex flex-col items-center gap-3 py-12 text-center"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {error instanceof Error ? error.message : t('teams.loadFailed')}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t('hub.error.retry')}
          </Button>
          {onRequestClose ? (
            <Button type="button" variant="outline" onClick={onRequestClose}>
              {t('teams.backToList')}
            </Button>
          ) : null}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col">
      <section className="mb-6">
        <label
          className="text-sm font-medium"
          htmlFor={isAdmin ? `team-detail-cover-file-${teamId}` : undefined}
        >
          {t('teams.coverLabel')}
        </label>
        <div className="mt-2 flex gap-3">
          <div
            className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]"
            data-testid="team-detail-cover-preview"
            aria-hidden={!coverPreviewSrc}
          >
            {coverPreviewSrc ? (
              <img
                src={coverPreviewSrc}
                alt=""
                draggable={false}
                className="pointer-events-none size-full object-cover"
                onError={onCoverPreviewError}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-lg font-medium text-[var(--color-foreground)]">
                {getTeamDisplayName(team, me?.id, t).slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          {isAdmin ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                ref={coverFileInputRef}
                id={`team-detail-cover-file-${teamId}`}
                type="file"
                accept="image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg"
                className="sr-only"
                onChange={(ev) => void onCoverFilePicked(ev)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={coverBusy || !online}
                  onClick={() => coverFileInputRef.current?.click()}
                >
                  {coverUploading ? t('teams.coverUploading') : t('teams.coverChange')}
                </Button>
                {coverDraft.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--color-muted-foreground)]"
                    disabled={coverBusy || !online}
                    onClick={() => void clearCover.mutateAsync()}
                  >
                    {t('teams.coverRemove')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {t('teams.membersHeading')}
          </h2>
          {isAdmin ? (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {isPersonalTeam ? t('teams.membersEditHintPersonal') : t('teams.membersEditHint')}
            </p>
          ) : null}
        </div>
        {isAdmin && membersError ? (
          <p className="mb-2 text-sm text-[var(--color-destructive)]" role="alert">
            {membersError}
          </p>
        ) : null}
        {isAdmin && membersDirty ? (
          <div className="mb-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={
                patchMembers.isPending ||
                !online ||
                (!isPersonalTeam && !effectiveMembers.some((m) => m.role === 'admin'))
              }
              title={!online ? t('hub.createOfflineHint') : undefined}
              onClick={() => void patchMembers.mutateAsync(effectiveMembers)}
            >
              {patchMembers.isPending ? t('common.load') : t('teams.saveMembers')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={patchMembers.isPending}
              onClick={() => {
                setMemberDraft(null)
                setMembersError(null)
              }}
            >
              {t('teams.discardMembers')}
            </Button>
          </div>
        ) : null}
        <ul className="flex flex-col gap-0 rounded-lg border border-[var(--color-border)]">
          {effectiveMembers.map((m) => (
            <li
              key={m.user.id}
              className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2.5 last:border-0"
            >
              <span className="min-w-0 truncate text-sm text-[var(--color-foreground)]">
                {m.user.email}
              </span>
              {isAdmin ? (
                <>
                  <label htmlFor={`member-role-${m.user.id}`} className="sr-only">
                    {t('teams.roleLabel')}: {m.user.email}
                  </label>
                  <Select
                    value={m.role}
                    onValueChange={(v) => setMemberRole(m.user.id, v as TeamRole)}
                    disabled={!online}
                  >
                    <SelectTrigger
                      id={`member-role-${m.user.id}`}
                      title={!online ? t('hub.createOfflineHint') : undefined}
                      className={cn(
                        'h-8 max-w-[11rem] shrink-0 rounded-md px-2 py-1 text-xs font-normal shadow-none',
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabel(t, r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <span
                  className={cn(
                    'shrink-0 rounded-md bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-foreground)]',
                  )}
                >
                  {roleLabel(t, m.role)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {t('teams.invitationsHeading')}
          </h2>
          {isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!online}
              title={!online ? t('hub.createOfflineHint') : undefined}
              onClick={() => {
                setInviteShownLink(null)
                setInviteLocalErr(null)
                setInviteOpen(true)
              }}
            >
              {t('teams.inviteAction')}
            </Button>
          ) : null}
        </div>

        {!isAdmin ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('teams.inviteAdminOnly')}</p>
        ) : invError ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {invError instanceof Error ? invError.message : t('teams.inviteListFailed')}
          </p>
        ) : invPending && !invPages ? (
          <div className="h-16 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : invitations.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">{t('teams.inviteEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-0 rounded-lg border border-[var(--color-border)]">
            {invitations.map((iv) => {
              const inviteLink = buildTeamInviteLink(teamId, iv.id)
              return (
                <li
                  key={iv.id}
                  className="flex flex-col gap-2 border-b border-[var(--color-border)] px-3 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 text-sm text-[var(--color-foreground)]">
                    <p className="truncate font-mono text-xs text-[var(--color-muted-foreground)]" title={inviteLink}>
                      {inviteLink}
                    </p>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {t('teams.inviteMeta', { at: new Date(iv.created_at).toLocaleString() })}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyInviteLink(inviteLink)}>
                      {t('teams.inviteCopy')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-[var(--color-destructive)]"
                      disabled={deleteInvite.isPending || !online}
                      title={!online ? t('hub.createOfflineHint') : undefined}
                      onClick={() => void deleteInvite.mutateAsync(iv.id)}
                    >
                      {t('teams.inviteRevoke')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div ref={invSentinelRef} className="h-1" aria-hidden />
        {isAdmin && invHasNext && !invFetchNext ? (
          <div className="mt-2 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!online}
              title={!online ? t('hub.createOfflineHint') : undefined}
              onClick={() => void invFetchNextPage()}
            >
              {t('hub.loadMore')}
            </Button>
          </div>
        ) : null}
        {isAdmin && invFetchNext ? (
          <p className="mt-2 text-center text-xs text-[var(--color-muted-foreground)]">
            {t('common.load')}
          </p>
        ) : null}
      </section>

      {isAdmin && !isPersonalTeam ? (
        <section className="mt-8 border-t border-[var(--color-border)] pt-6">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-destructive)]">
            {t('teams.deleteTeam')}
          </h2>
          <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">{t('teams.deleteTeamDescription')}</p>
          <Button
            type="button"
            variant="outline"
            disabled={!online}
            title={!online ? t('hub.createOfflineHint') : undefined}
            onClick={() => setDeleteTeamOpen(true)}
          >
            {t('teams.deleteTeam')}
          </Button>
        </section>
      ) : null}

      <AlertDialog
        open={deleteTeamOpen}
        onOpenChange={(open) => {
          setDeleteTeamOpen(open)
          if (!open) setDeleteTeamError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('teams.deleteTeamTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('teams.deleteTeamDescription')}</AlertDialogDescription>
            {deleteTeamError ? (
              <p className="pt-2 text-sm text-[var(--color-destructive)]" role="alert">
                {deleteTeamError}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('hub.delete.cancel')}</AlertDialogCancel>
            <Button
              type="button"
              className="bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:opacity-90"
              disabled={deleteTeam.isPending || !online}
              title={!online ? t('hub.createOfflineHint') : undefined}
              onClick={() => void deleteTeam.mutateAsync()}
            >
              {deleteTeam.isPending ? t('common.load') : t('teams.deleteTeamConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog.Root
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o)
          if (!o) {
            setInviteShownLink(null)
            setInviteLocalErr(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-elevated)]',
            )}
          >
            <Dialog.Title className="text-lg font-semibold">{t('teams.inviteDialogTitle')}</Dialog.Title>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{t('teams.inviteDialogDescription')}</p>
            {inviteShownLink ? (
              <div className="mt-4">
                <label className="text-sm font-medium" htmlFor="inv-link">
                  {t('teams.inviteLinkLabel')}
                </label>
                <Input
                  id="inv-link"
                  className="mt-1 font-mono text-xs"
                  readOnly
                  value={inviteShownLink}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            ) : null}
            {inviteLocalErr ? (
              <p className="mt-4 text-sm text-[var(--color-destructive)]" role="alert">
                {inviteLocalErr}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                {inviteShownLink ? t('teams.inviteDone') : t('teams.dialogCancel')}
              </Button>
              {inviteShownLink ? (
                <Button type="button" onClick={() => void copyInviteLink(inviteShownLink)}>
                  {t('teams.inviteCopy')}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={createInvite.isPending || !online}
                  title={!online ? t('hub.createOfflineHint') : undefined}
                  onClick={async () => {
                    setInviteLocalErr(null)
                    try {
                      const link = await createInvite.mutateAsync()
                      setInviteShownLink(link)
                    } catch (e) {
                      setInviteLocalErr(e instanceof Error ? e.message : t('teams.inviteFailed'))
                    }
                  }}
                >
                  {createInvite.isPending ? t('common.load') : t('teams.inviteCreateLink')}
                </Button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
