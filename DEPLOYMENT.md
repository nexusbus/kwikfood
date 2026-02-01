# Deploy KwikFood

Siga este guia para configurar o backend no Supabase e publicar o frontend no Vercel.

## 1. Configuração do Supabase

O KwikFood utiliza o Supabase para banco de dados e autenticação.

1.  Crie um novo projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2.  Vá para o **SQL Editor**.
3.  Copie o conteúdo do arquivo `setup.sql` (na raiz do projeto) e cole no editor.
4.  Execute o script SQL. Isso criará as tabelas `companies`, `products`, `orders` e `super_admins` com as políticas de RLS e configurações necessárias.
5.  Vá em **Project Settings** > **API**.
6.  Anote a **Project URL** e a **anon public key**.

## 2. Configuração de Variáveis de Ambiente

Crie um arquivo `.env` (ou use o `.env.local` existente como base) e preencha com os dados do seu projeto:

```env
VITE_SUPABASE_URL=Sua_Project_URL
VITE_SUPABASE_ANON_KEY=Sua_Anon_Key
```

## 3. Deploy no Vercel

A aplicação está configurada para deploy fácil no Vercel.

1.  Push do código para um repositório no **GitHub**, **GitLab** ou **Bitbucket**.
2.  Importe o projeto no [Vercel](https://vercel.com/new).
3.  No passo "Environment Variables", adicione:
    - `VITE_SUPABASE_URL`
    - `VITE_SUPABASE_ANON_KEY`
4.  Clique em **Deploy**.

## 4. Configurações Adicionais

- **Storage**: Se as imagens de produtos não aparecerem, certifique-se de criar um bucket público chamado `products` no Supabase Storage.
- **RLS**: As políticas de segurança padrão permitem visualização pública e operações administrativas. Ajuste conforme necessário para produção.
- **Super Admin**: O primeiro acesso ao Super Admin permitirá criar as credenciais iniciais.

---
Desenvolvido por NexusBus.
