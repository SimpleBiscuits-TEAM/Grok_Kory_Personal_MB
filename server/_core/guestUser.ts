import type { User } from "../../drizzle/schema";
import { GUEST_OPEN_ID } from "@shared/guestUser";

export const LOCAL_GUEST_USER: User = {
  id: 0,
  openId: GUEST_OPEN_ID,
  name: "Guest",
  email: null,
  loginMethod: "none",
  role: "user",
  advancedAccess: "approved",
  accessLevel: 3,
  accessApprovedBy: null,
  accessApprovedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(0),
};
