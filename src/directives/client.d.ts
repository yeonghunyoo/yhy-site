// client:demand 디렉티브 타입 (모듈 파일이어야 'astro' 타입을 덮지 않고 확장한다)
import 'astro';

declare module 'astro' {
  interface AstroClientDirectives {
    'client:demand'?: boolean;
  }
}
