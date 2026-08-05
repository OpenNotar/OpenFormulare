declare namespace Express {
  interface Request {
    adminUser?: string;
    adminUserId?: string;
    adminRole?: 'admin' | 'moderator';
    demoSessionId?: string;
  }
}
