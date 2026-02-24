export default function Card({ title, value }: any) {
  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow border dark:border-slate-700">

      <p className="text-sm text-slate-500">{title}</p>

      <p className="text-2xl font-bold text-slate-700 dark:text-white">
        {value}
      </p>
    </div>
  );
}