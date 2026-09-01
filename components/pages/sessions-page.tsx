import { Clock3, Construction } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export function SessionsPage() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-7 md:py-9">
      <div className="flex items-center gap-2 text-xs font-medium text-primary"><Clock3 className="size-4" /> Сессии</div>
      <div className="mt-20 flex flex-col items-center text-center">
        <div className="grid size-14 place-items-center rounded-2xl border bg-card shadow-sm"><Construction className="size-6 text-primary" /></div>
        <Badge variant="secondary" className="mt-5">Следующая итерация</Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Страница сессий появится позже</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Раздел уже зарезервирован в навигации, но пока не выполняет API-запросов и не управляет lifecycle сессий.</p>
      </div>
    </div>
  );
}
