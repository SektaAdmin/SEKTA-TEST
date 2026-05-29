import { redirect } from 'next/navigation'

export default function SalaryRedirect() {
  redirect('/settings/salary/calculations')
}
