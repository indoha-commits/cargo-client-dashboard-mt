
  # Dashboard UX Design

  This is a code bundle for Dashboard UX Design. The original project is available at https://www.figma.com/design/UHBbbuv4p4qKMpckAYTLwO/Dashboard-UX-Design.

  ## Running the code

  ### 1) Start Keycloak (local OIDC)
  From the repo root:

  ```bash
  cd cargo-dev
  docker compose up -d keycloak
  ```

  Keycloak will be available at:
  - Admin console: http://localhost:8081/admin (admin/admin)
  - Realm: `cargo-local`
  - Test users: `client@example.com`, `ops@example.com`, `admin@example.com` (password: `password`)

  ### 2) Run the dashboard
  ```bash
  npm i

  # Required
  export VITE_API_BASE_URL=http://localhost:3000
  export VITE_WORKERS_ENABLED=true

  # Optional (defaults shown)
  export VITE_KEYCLOAK_URL=http://localhost:8081
  export VITE_KEYCLOAK_REALM=cargo-local
  export VITE_KEYCLOAK_CLIENT_ID=cargo-client-dashboard

  npm run dev
  ```

  Then open http://localhost:5173 and click **Sign In** to authenticate via Keycloak.

  Notes:
  - This app now authenticates API calls using `Authorization: Bearer <access_token>`.
  - The email/password fields on the login screen are UI-only; Keycloak handles the real login.
  