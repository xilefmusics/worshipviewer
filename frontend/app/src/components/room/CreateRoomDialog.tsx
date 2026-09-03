import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Team } from '@/api/teams-sessions-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOnline } from '@/hooks/use-online'
import { createRoom, type RoomSourceType } from '@/lib/room'
import { randomRoomName } from '@/lib/room-name'
import { getTeamDisplayName } from '@/lib/team-display-name'

export type RoomSource = {
  type: RoomSourceType
  id: string
  title: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  teams: Team[]
  userId: string | undefined
  onCreated: (roomId: string) => void
  source?: RoomSource | null
}

function defaultRoomName(source: RoomSource | null | undefined): string {
  const title = source?.title.trim().slice(0, 80)
  return title || randomRoomName()
}

export function CreateRoomDialog({ open, onOpenChange, teams, userId, onCreated, source = null }: Props) {
  const { t } = useTranslation()
  const online = useOnline()
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [roomName, setRoomName] = useState(() => (source ? defaultRoomName(source) : ''))
  const [generatedNamePlaceholder, setGeneratedNamePlaceholder] = useState(() => defaultRoomName(source))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const teamId = teams.length === 1 ? teams[0].id : selectedTeamId

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedTeamId('')
      setRoomName(source ? defaultRoomName(source) : '')
      setGeneratedNamePlaceholder(defaultRoomName(source))
      setPending(false)
      setError(false)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 grid gap-4 rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-elevated)]">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <Dialog.Title className="text-lg font-semibold leading-none">
              {t('rooms.createTitle')}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-[var(--color-muted-foreground)]">
              {source
                ? t('rooms.createFromDescription', {
                    type: t(`rooms.sourceType.${source.type}`),
                    title: source.title,
                  })
                : t('rooms.createDescription')}
            </Dialog.Description>
          </div>

          {teams.length > 1 ? (
            <div className="grid gap-1.5">
              <label htmlFor="room-create-team" className="text-sm font-medium">
                {t('rooms.teamLabel')}
              </label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger id="room-create-team">
                  <SelectValue placeholder={t('rooms.teamPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {getTeamDisplayName(team, userId, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <label htmlFor="room-create-name" className="text-sm font-medium">
              {t('rooms.nameLabel')}
            </label>
            <Input
              id="room-create-name"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder={generatedNamePlaceholder}
              maxLength={80}
              autoComplete="off"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {t('rooms.createFailedAction')}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {t('teams.dialogCancel')}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={!online || pending || !teamId}
              aria-busy={pending}
              onClick={() => {
                if (!teamId) return
                setError(false)
                setPending(true)
                void createRoom({
                  team_id: teamId,
                  name: roomName.trim() || generatedNamePlaceholder,
                  ...(source
                    ? { source_type: source.type, source_id: source.id }
                    : {}),
                })
                  .then((created) => onCreated(created.room.id))
                  .catch(() => {
                    setPending(false)
                    setError(true)
                  })
              }}
            >
              {pending ? t('common.load') : t('rooms.createSubmit')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
