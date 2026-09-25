# SpendChat app icon (Flutter)

The website's mark, unchanged (chat bubble + "$", `src/app/icon.svg`), black on
white, cut to every Android and iOS launcher size. Folder layout mirrors a
Flutter project, so copy `android/` and `ios/` over the Flutter repo root:

```sh
cp -R android ios /path/to/spendchat_flutter/
```

| Where | What |
|---|---|
| `android/app/src/main/res/mipmap-{mdpi…xxxhdpi}/` | `ic_launcher.png` (48dp), `ic_launcher_round.png` (48dp), `ic_launcher_foreground.png` (108dp) |
| `android/app/src/main/res/mipmap-anydpi-v26/` | adaptive icon XML (Android 8+), incl. a monochrome layer for Android 13 themed icons |
| `android/app/src/main/res/values/ic_launcher_background.xml` | adaptive background colour `#FFFFFF` |
| `ios/Runner/Assets.xcassets/AppIcon.appiconset/` | every size in Flutter's default set + `Contents.json`; opaque, no alpha (App Store requirement) |
| `store/` | `play-store-512.png` (Play Console listing), `app-store-1024.png` (App Store Connect) |

Flutter's `AndroidManifest.xml` already points at `@mipmap/ic_launcher`; add
`android:roundIcon="@mipmap/ic_launcher_round"` on `<application>` to use the
round variant too. Then `flutter clean && flutter run`.

To change the icon, edit `source/app-icon.html` and run
`python3 source/generate.py` (needs Google Chrome + Pillow).
