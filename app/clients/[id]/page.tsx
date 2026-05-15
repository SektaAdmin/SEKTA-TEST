import ClientDetailClient from './ClientDetailClient'

interface Props {
  params: { id: string }
}

export default function ClientProfilePage({ params }: Props) {
  return <ClientDetailClient id={params.id} />
}
