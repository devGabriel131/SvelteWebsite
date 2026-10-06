import { getReportArchive, getReportArchivePageState } from '#lib/server/drive/index.ts';
import { createIstActions } from '#lib/server/ist-action.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => getReportArchivePageState();
export const actions = createIstActions(getReportArchive) satisfies Actions;
