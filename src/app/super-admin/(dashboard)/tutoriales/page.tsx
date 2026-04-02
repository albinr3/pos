import { getTutorialsDashboardData } from "./actions"
import { TutorialesClient } from "./tutoriales-client"

export const dynamic = "force-dynamic"

export default async function TutorialesPage() {
  const data = await getTutorialsDashboardData()
  return <TutorialesClient initialData={data} />
}
