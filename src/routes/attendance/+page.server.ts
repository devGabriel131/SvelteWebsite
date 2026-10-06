import { createAttendanceActions } from '#lib/server/attendance-action.ts';
import { getReportArchive, getReportArchivePageState } from '#lib/server/drive/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => getReportArchivePageState();
export const actions = createAttendanceActions(getReportArchive) satisfies Actions;
