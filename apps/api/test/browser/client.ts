import * as session from '../../../web/src/auth/session-coordinator';
import * as api from '../../../web/src/lib/api-client';
import { getAccessToken } from '../../../web/src/auth/token-store';
Object.assign(window, { authTest: { ...session, ...api, getAccessToken } });
