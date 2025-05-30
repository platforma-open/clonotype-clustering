import type { PColumnIdAndSpec } from '@platforma-sdk/model';

export const isSequenceColumn = (column: PColumnIdAndSpec) => {
  // sequencesRef
  console.log('isSequenceColumn', column.spec.name === 'pl7.app/vdj/sequence');
  return column.spec.name === 'pl7.app/vdj/sequence';
};

export const isLabelColumnOption = (_column: PColumnIdAndSpec) => {
  return true;
};

export const isLinkerColumn = (column: PColumnIdAndSpec) => {
  console.log('isLinkerColumn', column.spec.annotations?.['pl7.app/isLinkerColumn'] === 'true');
  return column.spec.annotations?.['pl7.app/isLinkerColumn'] === 'true';
};
