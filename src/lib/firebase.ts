import { initializeApp, getApp, getApps } from "firebase/app";
import { getAnalytics, logEvent, isSupported, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBwfBcQ5HM_jbHrwwMa415fTg5NHoYuL6g",
  authDomain: "anuwad-789a9.firebaseapp.com",
  projectId: "anuwad-789a9",
  storageBucket: "anuwad-789a9.firebasestorage.app",
  messagingSenderId: "157515258017",
  appId: "1:157515258017:web:9d1608bbe9fb715f5ef8e0",
  measurementId: "G-71BDQV3HG5"
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let analytics: Analytics | null = null;

// Safe initialization of Firebase Analytics
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

/**
 * Log a page view event to Firebase Analytics
 * @param pagePath The URL path of the page viewed
 */
export function logPageView(pagePath: string) {
  if (typeof window !== "undefined") {
    if (analytics) {
      logEvent(analytics, "page_view", {
        page_path: pagePath,
      });
    } else {
      isSupported().then((supported) => {
        if (supported && !analytics) {
          analytics = getAnalytics(app);
        }
        if (analytics) {
          logEvent(analytics, "page_view", {
            page_path: pagePath,
          });
        }
      });
    }
  }
}

export { app, analytics };
