import { Test, TestingModule } from '@nestjs/testing';
import { RbacService } from '../rbac.service';

describe('RbacService', () => {
  let service: RbacService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RbacService],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hasPermission', () => {
    it('should return true for wildcard', () => {
      expect(service.hasPermission(['*'], 'orders:create')).toBe(true);
    });

    it('should return true when permission exists', () => {
      expect(
        service.hasPermission(['orders:create', 'orders:modify'], 'orders:create'),
      ).toBe(true);
    });

    it('should return false when permission missing', () => {
      expect(
        service.hasPermission(['orders:create'], 'orders:void'),
      ).toBe(false);
    });
  });

  describe('resolveEffectivePermissions', () => {
    it('should merge and deduplicate permissions', () => {
      const result = service.resolveEffectivePermissions(
        [['orders:create', 'menu:read'], ['orders:create', 'payments:process']],
        ['orders:discount'],
      );
      expect(result).toEqual(
        expect.arrayContaining([
          'orders:create',
          'menu:read',
          'payments:process',
          'orders:discount',
        ]),
      );
      expect(result.length).toBe(4);
    });
  });
});
