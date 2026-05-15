import ClassDetailClient from './ClassDetailClient'

interface Props {
  params: { classId: string }
}

export default function ClassDetailPage({ params }: Props) {
  return <ClassDetailClient classId={params.classId} />
}
