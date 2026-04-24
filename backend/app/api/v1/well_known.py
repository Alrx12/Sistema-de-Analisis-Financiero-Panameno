"""
well_known.py — Sirve /.well-known/assetlinks.json para Android App Links.

Este endpoint permite que los links https://safpro.us/* abran directamente
la app de SAFPRO en Android sin pasar por el browser (App Links verification).

Referencia:
  https://developer.android.com/training/app-links/verify-android-applinks

Cómo completar la configuración (una vez que tengas el keystore de release):
  1. Generar el keystore de release:
       keytool -genkey -v -keystore safpro-release.keystore \
         -alias safpro -keyalg RSA -keysize 2048 -validity 10000

  2. Obtener el SHA-256 del certificado:
       keytool -list -v -keystore safpro-release.keystore -alias safpro \
         | grep "SHA256:" | awk '{print $2}'
       # Resultado ejemplo: AA:BB:CC:DD:...

  3. Reemplazar PLACEHOLDER_SHA256_FINGERPRINT abajo con ese valor.

  4. Deploy (bash deploy/update_server.sh)

  5. Verificar en: https://digitalassetlinks.googleapis.com/v1/statements:list
       ?source.web.site=https://safpro.us
       &relation=delegate_permission/common.handle_all_urls

  6. En app.json, el intentFilter con autoVerify:true ya está configurado.
     Rebuild el APK vía GitHub Actions para que el cambio surta efecto.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

# ── SHA-256 del keystore de release ──────────────────────────────────────────
# Reemplaza este valor con el SHA-256 real al generar el keystore de release.
# Formato: "XX:XX:XX:..." (cada byte separado por ":", mayúsculas, sin espacios)
RELEASE_SHA256 = "60:4B:84:16:8F:D1:CD:CC:9B:9C:6A:22:B0:3C:BA:A9:AC:E0:EB:57:17:AA:9C:6B:DC:C6:F2:85:BB:B1:FB:04"

# SHA-256 del keystore de DEBUG (para desarrollo/testing en dispositivos físicos).
# Lo puedes obtener con:
#   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
#     -storepass android -keypass android | grep SHA256
DEBUG_SHA256 = "D7:5E:B7:8A:9A:7A:A2:67:A0:75:F2:21:42:DA:E6:48:90:B5:28:1B:F2:4E:26:A2:B0:8C:28:3C:5B:93:E5:EB"

ASSET_LINKS = [
    {
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": "com.safpro.app",
            "sha256_cert_fingerprints": [
                # El debug key se incluye para que funcione en desarrollo.
                # ANTES DE PRODUCCIÓN: reemplazar PLACEHOLDER con el SHA-256 del
                # keystore de release y considerar eliminar el debug SHA si aplica.
                DEBUG_SHA256,
                RELEASE_SHA256,
            ],
        },
    }
]


@router.get(
    "/.well-known/assetlinks.json",
    summary="Android App Links verification",
    include_in_schema=False,  # No exponer en Swagger — es infraestructura
)
async def assetlinks():
    """
    Endpoint requerido por Android para verificar App Links.

    Android descarga este archivo cuando instala la app para confirmar que
    safpro.us autoriza a com.safpro.app a manejar sus links.
    """
    return JSONResponse(
        content=ASSET_LINKS,
        headers={
            "Content-Type": "application/json",
            # Cache agresivo: Android verifica esto rara vez (solo al instalar/actualizar)
            "Cache-Control": "public, max-age=86400",
        },
    )
