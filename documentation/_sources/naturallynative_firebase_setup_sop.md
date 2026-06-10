# SOP: Separate Firebase Project Setup for NaturallyNative

This document outlines the step-by-step process to create and configure a new, independent Google Firebase project for the NaturallyNative B2B platform.

## Phase 1: Google Firebase Console Setup

### 1. Create the Firebase Project

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Click **"Add project"**.
3.  Enter a project name (e.g., `naturallynative-prod`).
4.  Configure Google Analytics (Optional, but recommended for production).
5.  Click **"Create project"**.

### 2. Register Web App (Frontend Config)

1.  On the project overview page, click the **Web icon (</>)** to add an app.
2.  Enter an App Nickname (e.g., `NaturallyNative Storefront`).
3.  **Copy the `firebaseConfig` object** provided in the setup snippet. You will need these keys:
    - `apiKey`
    - `authDomain`
    - `projectId`
    - `storageBucket`
    - `messagingSenderId`
    - `appId`

### 3. Enable Authentication

1.  In the left sidebar, go to **Build > Authentication**.
2.  Click **"Get Started"**.
3.  Under **Sign-in method**, enable:
    - **Email/Password**: Essential for standard B2B accounts.
    - **Google**: Required for the GSI client implemented in `index.html`.
4.  (Optional) Add your production domain to the **Authorized domains** list.

### 4. Setup Cloud Firestore (Database)

1.  Go to **Build > Firestore Database**.
2.  Click **"Create database"**.
3.  Select **"Production mode"** (or Test mode if you prefer temporary open rules).
4.  Choose a location closest to your users (e.g., `asia-south1`).
5.  **Apply Security Rules**:
    - Go to the **Rules** tab.
    - Copy the contents from the `firestore.rules` file in your project and paste them here.
    - Click **"Publish"**.

### 5. Generate Service Account (Backend API)

1.  Go to **Project Settings (Gear icon) > Service accounts**.
2.  Ensure **Firebase Admin SDK** is selected.
3.  Click **"Generate new private key"**.
4.  This downloads a `.json` file. **Keep this secret.** You will extract the fields for your environment configuration.

---

## Phase 2: Project Configuration & API Update

### 1. Update Frontend Environment

The frontend expects a configuration object in a file that `env-loader.js` can read. Usually, this is managed via a `.env` file or a local `assets/js/env.js`.

**Update your `.env` with the new Web App credentials:**

```env
# Firebase Frontend Config (Stringified JSON)
APP_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'
```

### 2. Update Backend API Environment

The server acts as a Firebase Admin. Update the following variables in your `.env` using the values from the **Service Account JSON** you downloaded earlier:

```env
# Firebase Admin Config
FIREBASE_PROJECT_ID="your-new-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@your-new-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# API Base (if hosted separately)
APP_API_BASE_URL="https://your-api-domain.com/api"
```

### 3. Verify Cart & Authentication Logic

- **Authentication**: Ensure `assets/js/auth.js` is correctly reading `window.APP_FIREBASE_CONFIG`.
- **Cart**: The `site.js` file uses the collection name `carts`. Ensure this collection is created in Firestore.
- **API Endpoints**: The `verifyIdToken` function in `api/_services.js` will now automatically use the new Admin credentials to validate sessions.

---

## Phase 3: Validation Checklist

- [ ] **Login Test**: Can you sign in using Google/Email?
- [ ] **Cart Persistence**: Add an item as a guest, then log in. Does the cart merge?
- [ ] **Security Rules**: Validate rules are active by trying to read unauthorized data.
- [ ] **Order Logging**: Place a test order. Does it appear in the new Firestore instance?
