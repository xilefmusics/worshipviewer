# Issues

## Bugs

Bug documents are created from the [bug template](templates/bug-template.md)
and stored in `[bugs/](bugs/)`.


| Bug                                                                                                                        | Area        | Primary persona | Severity | Frequency | Reproducibility | Effort | Status |
| -------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- | -------- | --------- | --------------- | ------ | ------ |
| [Unliked songs remain in the current player's Liked list](bugs/unliked-songs-remain-in-current-player-liked-list.md)       | Player      | musician        | 2        | 3         | 5               | 5      | fixed  |
| [Song editor key-change modes save the same chord result](bugs/song-editor-key-change-modes-save-the-same-chord-result.md) | Song Editor | worship leader  | 3        | 4         | 5               | 2      | fixed  |




## Stories

Story documents are refined from an existing [idea](#ideas), created from the
[story template](templates/story-template.md), and stored in [stories/](stories/).


| Story                                                                                       | Source idea                              | Area   | Persona        | Status |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ | -------------- | ------ |
| [Open tutorials from the profile menu](stories/open-tutorials-from-profile-menu.md)         | Link tutorials from the profile menu     | Hub    | operator       | ready  |
| [Scale chord-song font size in the player](stories/player-chord-song-font-scale.md)         | Scale chord-song font size in the player | Player | musician       | ready  |
| [Create independent team Rooms](stories/create-independent-team-rooms.md)                   | Manage Rooms independently from players  | Rooms  | worship leader | ready  |
| [Keep Rooms open until explicitly closed](stories/persist-rooms-until-explicitly-closed.md) | Manage Rooms independently from players  | Rooms  | worship leader | ready  |
| [Promote Rooms in hub navigation](stories/promote-rooms-in-hub-navigation.md)               | Manage Rooms independently from players  | Hub    | worship leader | ready  |




## Ideas

The audited refinement [Impersonate users through audited support sessions](ideas/admin-impersonation-audited-support-sessions.md)
is implemented behind `IMPERSONATION_ENABLED`; its constraints are tracked in
`[docs/business-logic-constraints/impersonation.md](../business-logic-constraints/impersonation.md)`.

Idea documents are created from the [idea template](templates/idea-template.md)
and stored in `[ideas/](ideas/)`.


| Idea                                                                                                        | Area           | Primary persona | Impact audience | Change type                           | Clarity | Impact | Effort | Status |
| ----------------------------------------------------------------------------------------------------------- | -------------- | --------------- | --------------- | ------------------------------------- | ------- | ------ | ------ | ------ |
| [Speed reads with JWT-cached permissions](ideas/jwt-cached-read-permissions.md)                             | Auth           | maintainer      | both            | improvement to an existing capability | 3       | 3      | 4      | rough  |
| [Calculate a second generation of admin metrics on the fly](ideas/on-the-fly-admin-metrics.md)              | Admin          | administrator   | maintainer      | improvement to an existing capability | 2       | 2      | 3      | rough  |
| [Keep Rooms open after the host leaves](ideas/keep-rooms-open-without-host.md)                              | Rooms          | worship leader  | user            | improvement to an existing capability | 3       | 4      | 3      | rough  |
| [Let participants queue the next Room songs](ideas/room-next-song-queue.md)                                 | Rooms          | musician        | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Let players enlarge lyrics without app-wide zoom](ideas/player-zoom-and-lyric-font-scale.md)               | Player         | musician        | user            | improvement to an existing capability | 3       | 3      | 3      | rough  |
| [Publish container images to GitHub Container Registry](ideas/publish-images-to-ghcr.md)                    | Infra          | maintainer      | maintainer      | improvement to an existing capability | 4       | 2      | 2      | rough  |
| [Publish proper GitHub Releases again](ideas/restore-github-releases.md)                                    | Infra          | maintainer      | maintainer      | improvement to an existing capability | 2       | 2      | 2      | rough  |
| [Set up a dedicated staging environment](ideas/dedicated-staging-environment.md)                            | QA             | maintainer      | maintainer      | new capability or area                | 2       | 3      | 3      | rough  |
| [Run end-to-end tests automatically in CI](ideas/ci-enforced-e2e-tests.md)                                  | QA             | maintainer      | maintainer      | improvement to an existing capability | 4       | 3      | 3      | rough  |
| [Make installing the app easier](ideas/improve-app-install-experience.md)                                   | Install        | operator        | user            | improvement to an existing capability | 2       | 3      | 3      | rough  |
| [Show capo-friendly chords in the player](ideas/player-capo-calculator.md)                                  | Player         | musician        | user            | new capability or area                | 2       | 3      | 3      | rough  |
| [Take notes in the player](ideas/player-notetaking-initial.md)                                              | Player         | musician        | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Play a click track from the player](ideas/player-sampling-click-track.md)                                  | Player         | musician        | user            | new capability or area                | 2       | 4      | 4      | rough  |
| [Play cue tracks from the player](ideas/player-sampling-cue-track.md)                                       | Player         | musician        | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Play pads from the player](ideas/player-sampling-pad.md)                                                   | Player         | musician        | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Play a single backing track from the player](ideas/player-sampling-single-track.md)                        | Player         | musician        | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Play multi-track sessions from the player](ideas/player-sampling-multi-track.md)                           | Player         | musician        | user            | new capability or area                | 2       | 4      | 5      | rough  |
| [Detect chords and progressions from MIDI](ideas/midi-chord-progression-detection.md)                       | Player         | musician        | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Add AI assistance to the song editor](ideas/song-editor-ai-integration.md)                                 | Song Editor    | worship leader  | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Add AI assistance to the setlist editor](ideas/setlist-editor-ai-integration.md)                           | Setlist Editor | worship leader  | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Add a digital music director in the player](ideas/player-digital-music-director.md)                        | Player         | worship leader  | user            | new capability or area                | 1       | 4      | 5      | rough  |
| [Assign custom AV backgrounds per song](ideas/av-custom-backgrounds.md)                                     | AV             | AV team         | user            | new capability or area                | 3       | 3      | 4      | rough  |
| [Use dynamic backgrounds in AV mode](ideas/av-dynamic-backgrounds.md)                                       | AV             | AV team         | user            | new capability or area                | 1       | 3      | 4      | rough  |
| [Project custom slides in AV mode](ideas/av-custom-slides.md)                                               | AV             | presenter       | user            | new capability or area                | 3       | 4      | 4      | rough  |
| [Link related songs to each other](ideas/song-to-song-links.md)                                             | General        | worship leader  | user            | new capability or area                | 2       | 3      | 4      | rough  |
| [Show how often a song appears in setlists](ideas/song-in-setlist-statistics.md)                            | General        | worship leader  | user            | new capability or area                | 2       | 3      | 3      | rough  |
| [Plan setlists with a range planner](ideas/setlist-range-planner.md)                                        | Setlist Editor | worship leader  | user            | new capability or area                | 1       | 3      | 3      | rough  |
| [Let admins impersonate users](ideas/admin-impersonate-users.md)                                            | Admin          | administrator   | both            | new capability or area                | 3       | 3      | 3      | rough  |
| [Impersonate users through audited support sessions](ideas/admin-impersonation-audited-support-sessions.md) | Admin          | administrator   | both            | new capability or area                | 4       | 4      | 4      | rough  |
| [Edit songs as SongBeamer source](ideas/song-editor-songbeamer-source.md)                                   | Song Editor    | worship leader  | user            | improvement to an existing capability | 3       | 3      | 3      | rough  |




## Rough Ideas

- switch from rightclick to 3dot menus
- cleanup config
- internal feedback
- update all dependencies

