import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SorobanInvokeController } from './soroban-invoke.controller';
import { SorobanInvokeService } from './soroban-invoke.service';
import { InvokeErrorCode, InvokeResult } from './soroban-invoke.model';

describe('SorobanInvokeController', () => {
  let controller: SorobanInvokeController;
  let service: { invoke: jest.Mock };

  const invokeResult: InvokeResult = {
    success: true,
    result: 'AAAA',
    errorCode: undefined,
    errorMessage: undefined,
    requestId: 'req-1',
  } as unknown as InvokeResult;

  beforeEach(async () => {
    service = { invoke: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SorobanInvokeController],
      providers: [{ provide: SorobanInvokeService, useValue: service }],
    }).compile();

    controller = module.get<SorobanInvokeController>(SorobanInvokeController);
  });

  const cases: Array<[InvokeErrorCode, HttpStatus]> = [
    [InvokeErrorCode.CONTRACT_NOT_ALLOWED, HttpStatus.FORBIDDEN],
    [InvokeErrorCode.FUNCTION_NOT_ALLOWED, HttpStatus.FORBIDDEN],
    [InvokeErrorCode.FEE_TOO_LOW, HttpStatus.BAD_REQUEST],
    [InvokeErrorCode.SIMULATION_REVERTED, HttpStatus.UNPROCESSABLE_ENTITY],
    [InvokeErrorCode.RPC_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE],
  ];

  it.each(cases)(
    'maps %s to HTTP %s and surfaces errorCode',
    async (errorCode, status) => {
      service.invoke.mockRejectedValue(
        new HttpException(
          { errorCode, message: `error ${errorCode}` },
          status,
        ),
      );

      let caught: HttpException | undefined;
      try {
        await controller.invoke({} as never);
      } catch (err) {
        caught = err as HttpException;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect(caught!.getStatus()).toBe(status);
      const body = caught!.getResponse() as { errorCode?: string };
      expect(body.errorCode).toBe(errorCode);
    },
  );

  it('returns a successful InvokeResult without key material', async () => {
    service.invoke.mockResolvedValue(invokeResult);

    const response = await controller.invoke({} as never);

    expect(response).toBeDefined();
    const serialized = JSON.stringify(response).toLowerCase();
    expect(serialized).not.toContain('privatekey');
    expect(serialized).not.toContain('private_key');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('signedtransaction');
    expect(serialized).not.toContain('signed_transaction');

    const allowedKeys = new Set(Object.keys(invokeResult));
    for (const key of Object.keys(response as object)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});
