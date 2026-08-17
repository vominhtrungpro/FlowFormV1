import { Fragment, useState } from 'react';
import { FieldDto, GatekeeperApproval } from '../api/requests';
import { FieldGroup } from './FieldGroup';

interface Props {
  approvals: GatekeeperApproval[];
  formFields: FieldDto[];
  hint?: string;
}

// Lets a viewer click a gatekeeper's name to see the exact form they personally answered when
// they acted — each row's fieldValues already carries that gatekeeper's own per-task answer
// (falling back to the shared one), computed server-side in RequestsService.getDetail.
export function GatekeeperApprovalsTable({ approvals, formFields, hint }: Props) {
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  return (
    <div className="card mb-3">
      <div className="card-header">Gatekeeper approvals</div>
      <table className="table table-sm mb-0">
        <thead>
          <tr>
            <th>Function</th>
            <th>Approver</th>
            <th>Decision</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          {approvals.map((g) => (
            <Fragment key={g.taskId}>
              <tr
                style={g.approved ? { cursor: 'pointer' } : undefined}
                onClick={g.approved ? () => setExpandedTaskId((prev) => (prev === g.taskId ? null : g.taskId)) : undefined}
              >
                <td>{g.function}</td>
                <td className="small">{g.email}</td>
                <td>
                  <span className={`badge ${g.approved ? 'text-bg-success' : 'text-bg-secondary'}`}>
                    {g.approved ? 'Approved' : 'Pending'}
                  </span>
                </td>
                <td className="small text-muted">{g.comment}</td>
              </tr>
              {expandedTaskId === g.taskId && (
                <tr>
                  <td colSpan={4} className="bg-light">
                    {formFields.length > 0 ? (
                      <FieldGroup fields={formFields} values={g.fieldValues} onChange={() => {}} disabled />
                    ) : (
                      <p className="text-muted small mb-0">No form on this step for {g.email} to fill in.</p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {hint && <p className="hint p-2 mb-0">{hint}</p>}
    </div>
  );
}
