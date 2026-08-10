from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def configure_android() -> None:
    manifest = ROOT / "android/app/src/main/AndroidManifest.xml"
    text = manifest.read_text(encoding="utf-8")
    permissions = [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION",
        "android.permission.POST_NOTIFICATIONS",
    ]
    missing = [p for p in permissions if p not in text]
    if missing:
        marker = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
        additions = "\n".join(
            f'    <uses-permission android:name="{permission}" />'
            for permission in missing
        )
        text = text.replace(marker, f"{marker}\n{additions}", 1)
        manifest.write_text(text, encoding="utf-8")

    gradle = ROOT / "android/app/build.gradle.kts"
    if gradle.exists():
        text = gradle.read_text(encoding="utf-8")
        if "minSdk = flutter.minSdkVersion" in text:
            gradle.write_text(
                text.replace("minSdk = flutter.minSdkVersion", "minSdk = 24", 1),
                encoding="utf-8",
            )


def configure_ios() -> None:
    plist = ROOT / "ios/Runner/Info.plist"
    text = plist.read_text(encoding="utf-8")
    if "NSLocationWhenInUseUsageDescription" not in text:
        insert = """\n\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>نستخدم موقع السائق أثناء تنفيذ الرحلة لعرض موقع المركبة للمسافر.</string>\n\t<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>\n\t<string>نحتاج موقع السائق أثناء الرحلة حتى عند انتقال التطبيق إلى الخلفية.</string>\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>\n"""
        text = text.replace("</dict>\n</plist>", f"{insert}</dict>\n</plist>", 1)
        plist.write_text(text, encoding="utf-8")


def remove_generated_test() -> None:
    generated_test = ROOT / "test/widget_test.dart"
    if generated_test.exists():
        generated_test.unlink()


def main() -> None:
    configure_android()
    configure_ios()
    remove_generated_test()
    print("Configured Android/iOS permissions for Ride Platform Driver.")


if __name__ == "__main__":
    main()
