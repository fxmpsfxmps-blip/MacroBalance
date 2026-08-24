# Proveedores OAuth de MacroBalance

La aplicación ya comparte un único coordinador de inicio de sesión para Google, Facebook, Microsoft, Apple, GitHub y X. Firebase Authentication conserva la sesión con persistencia local y `onAuthStateChanged` es la fuente de verdad de la interfaz.

Los secretos se configuran exclusivamente en las consolas del proveedor y de Firebase. No deben copiarse a este repositorio, Vercel ni al JavaScript del navegador.

## URI de retorno común

Para el proyecto Firebase actual, registra esta URL exacta cuando el proveedor solicite una callback o redirect URI:

```text
https://macrobalance-502bb.firebaseapp.com/__/auth/handler
```

En Firebase Console, abre **Authentication → Settings → Authorized domains** y agrega cada dominio desde el que se probará el sitio, incluido el dominio de producción y cada Preview de Vercel que realmente se vaya a usar.

## X / Twitter

1. Abre [X Developer Portal](https://developer.x.com/en/portal/dashboard) y entra a **Projects & Apps → tu aplicación → User authentication settings**.
2. Activa OAuth 1.0a y configura el tipo de aplicación Web App.
3. Registra como Callback URI la URL común indicada arriba. Configura también la URL pública del sitio como Website URL.
4. Copia la **API Key** y la **API Key Secret** desde Keys and tokens.
5. Abre **Firebase Console → Authentication → Sign-in method → Twitter**. Activa el proveedor y pega allí la API Key y API Secret.

La API de X se usa únicamente para identidad. Las claves nunca se introducen en el frontend.

## GitHub

1. Abre **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Usa la URL pública del sitio como Homepage URL y la URL común indicada arriba como Authorization callback URL.
3. Crea un Client Secret.
4. Abre **Firebase Console → Authentication → Sign-in method → GitHub**. Activa el proveedor y pega allí el **Client ID** y **Client Secret**.

## Microsoft

1. Abre [Microsoft Entra admin center](https://entra.microsoft.com/) → **Identity → Applications → App registrations → New registration**.
2. Elige los tipos de cuenta que aceptará MacroBalance.
3. En **Authentication**, agrega una plataforma **Web** y registra la URL común indicada arriba como Redirect URI.
4. Copia el **Application (client) ID**. En **Certificates & secrets**, crea un Client Secret y conserva su valor en un gestor seguro.
5. Abre **Firebase Console → Authentication → Sign-in method → Microsoft**. Activa el proveedor y pega allí el Application Client ID y Client Secret.

## Apple

1. Abre [Apple Developer](https://developer.apple.com/account/resources/identifiers/list) → **Certificates, Identifiers & Profiles**.
2. Configura Sign in with Apple para el App ID y crea un **Services ID** para la web.
3. En la configuración web del Services ID, registra el dominio público y la URL común indicada arriba como Return URL.
4. Crea una Key con capacidad **Sign in with Apple** y conserva el archivo `.p8` de forma privada. Reúne **Services ID**, **Team ID**, **Key ID** y la private key.
5. Abre **Firebase Console → Authentication → Sign-in method → Apple**. Activa el proveedor e introduce esos cuatro datos únicamente allí.

El archivo `.p8` no debe guardarse en Git ni en el frontend.

## Google y Facebook

Ya están integrados en el frontend. Deben permanecer activados en **Firebase Console → Authentication → Sign-in method** y sus aplicaciones OAuth deben incluir la misma callback de Firebase y los dominios autorizados correspondientes.

## Diagnóstico

- `auth/operation-not-allowed`: el botón está preparado, pero el proveedor aún no está activado/configurado en Firebase.
- `auth/unauthorized-domain`: falta agregar el dominio actual a Authorized domains.
- `auth/popup-closed-by-user` y `auth/cancelled-popup-request`: cancelaciones voluntarias; la aplicación las limpia y permite cambiar de proveedor.
- Los mensajes COOP sobre `window.closed` pueden proceder del sondeo interno de un popup de un tercero incluso con `same-origin-allow-popups`. No equivalen por sí solos a un fallo de sesión; el resultado real se determina con el error de Firebase y `onAuthStateChanged`.
