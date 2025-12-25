
#ifndef MOCK_SETJMP_H
#define MOCK_SETJMP_H

#include <stdlib.h>

// Mock JmpBuf
typedef int jmp_buf[1];

#define setjmp(env) 0
#define longjmp(env, val) exit(66)

#endif
