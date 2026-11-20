-- Money — 004_seed.sql
-- Plano gratuito (estrutura pronta para SaaS futuro) + categorias padrão do sistema (user_id null).

insert into public.plans (id, name, price_cents, limits)
values ('free', 'Free', 0, '{"max_accounts": 5, "max_goals": 5}'::jsonb)
on conflict (id) do nothing;

insert into public.categories (user_id, name, type, color, icon) values
  (null, 'Salário', 'income', '#2DD4BF', 'banknote'),
  (null, 'Freelance', 'income', '#14E0B4', 'briefcase'),
  (null, 'Investimentos', 'income', '#4FD1C5', 'trending-up'),
  (null, 'Outras receitas', 'income', '#81E6D9', 'plus-circle'),
  (null, 'Moradia', 'expense', '#F87171', 'home'),
  (null, 'Alimentação', 'expense', '#FB923C', 'utensils'),
  (null, 'Transporte', 'expense', '#FBBF24', 'car'),
  (null, 'Saúde', 'expense', '#F472B6', 'heart-pulse'),
  (null, 'Educação', 'expense', '#A78BFA', 'graduation-cap'),
  (null, 'Lazer', 'expense', '#60A5FA', 'ticket'),
  (null, 'Compras', 'expense', '#F87171', 'shopping-bag'),
  (null, 'Assinaturas', 'expense', '#FB7185', 'repeat'),
  (null, 'Outras despesas', 'expense', '#94A3B8', 'more-horizontal')
on conflict do nothing;
