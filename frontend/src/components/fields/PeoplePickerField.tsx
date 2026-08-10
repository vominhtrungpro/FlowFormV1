import { useEffect, useState } from 'react';
import { listUsers, UserDto } from '../../api/users';
import { TagSelect } from '../TagSelect';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function splitEmails(value: string) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function PeoplePickerField({ value, onChange, disabled }: Props) {
  const [users, setUsers] = useState<UserDto[]>([]);

  useEffect(() => {
    listUsers().then(setUsers);
  }, []);

  const selected = splitEmails(value);

  return (
    <TagSelect
      showAvatars
      disabled={disabled}
      options={users.map((u) => ({ value: u.email, label: `${u.email} · ${u.tag}`, avatar: u.email.slice(0, 1).toUpperCase() }))}
      selected={selected}
      onChange={(values) => onChange(values.join(','))}
    />
  );
}
