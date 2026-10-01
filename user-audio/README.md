# Your own sounds

Drop audio files in this folder and INDULGENT will use them instead of the built-in
synthesized sounds. Nothing is required: delete a file and the built-in sound comes back.

Supported: `.wav`, `.mp3`, `.ogg`, `.m4a`, `.aac`, `.flac`.
The **file name** (without the extension) says which sound it replaces.
Reload the page, then press **Start Session** to load them.

| File name        | When it plays                                   |
| ---------------- | ----------------------------------------------- |
| `click`          | any button press                                |
| `send`           | you send a message                              |
| `ask`            | the "May I?" popup appears                      |
| `allow`          | you press Allow                                 |
| `deny`           | you press Deny                                  |
| `course`         | a menu item (todo) is served                    |
| `dish`           | you earn a Dish (achievement)                   |
| `done`           | a take finishes successfully                    |
| `error`          | something fails                                 |
| `tool-read`      | Claude reads a file                             |
| `tool-search`    | Claude searches                                 |
| `tool-edit`      | Claude edits a file                             |
| `tool-create`    | Claude creates a file                           |
| `tool-delete`    | Claude deletes something                        |
| `tool-run`       | Claude runs a command                           |
| `tool-other`     | any other tool                                  |
| `music-idle`     | a background loop while waiting / thinking      |
| `music-working`  | a background loop while Claude is working       |

If you provide `music-idle` or `music-working`, that loop replaces the generated music.
Keep the files short (a second or less) except the two `music-` loops, which loop forever.
Only use sounds you have the right to use.
