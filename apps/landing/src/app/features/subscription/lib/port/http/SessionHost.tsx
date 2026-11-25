import { type JSX, type ReactNode } from 'react';

import { runtime } from '@chatic/runtime-react';

export const SessionHost = ({ children }: { children: ReactNode }): JSX.Element => (
    <runtime.connection.RuntimeAuthHost>{children}</runtime.connection.RuntimeAuthHost>
);
