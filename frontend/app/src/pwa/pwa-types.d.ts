/** Chromium install prompt — not in all TS DOM libs */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  prompt(): Promise<void>
}

interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean
}
