// The four bundled device profiles (15 §11), parsed at load so a broken file fails loudly in the
// build and the tests, never at a user's launch.
import desktopJson from '../../../config/profiles/desktop.json';
import laptopJson from '../../../config/profiles/laptop-battery.json';
import tabletJson from '../../../config/profiles/tablet.json';
import phoneJson from '../../../config/profiles/phone.json';
import { deviceProfileSchema, type DeviceProfile, type ProfileId } from '../contracts/profile';

export const BUNDLED: Record<ProfileId, DeviceProfile> = {
  'desktop': deviceProfileSchema.parse(desktopJson),
  'laptop-battery': deviceProfileSchema.parse(laptopJson),
  'tablet': deviceProfileSchema.parse(tabletJson),
  'phone': deviceProfileSchema.parse(phoneJson),
};

/** The default, and today's numbers exactly. */
export const DESKTOP: DeviceProfile = BUNDLED.desktop;
